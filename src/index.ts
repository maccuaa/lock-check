import { Command, flags } from "@oclif/command";
import * as path from "path";
import * as execa from "execa";
import * as Ora from "ora";
import * as Async from "async";
import fsa from "./fsa";

interface PackageLock {
  name: string;
  version: string;
  lockfileVersion: number;
  requires: boolean;
  dependencies: {
    [name: string]: {
      version: string;
      resolved: string;
      integrity: string;
    };
  };
}

interface Context {
  projectPath: string;
  packageLockPath: string;
  packageLock: PackageLock | null;
}

interface Task {
  skip: boolean;
  title: string;
  task: (ctx: Context, task: Task) => Promise<void>;
}

class LockCheck extends Command {
  static description = "Verify the package-lock.json file in a project.";

  static flags = {
    version: flags.version({ char: "v" }),

    download: flags.boolean({
      char: "d",
      description:
        "Attempt to download all the tgz files found in package-lock.json",
      default: false
    }),

    registry: flags.string({
      char: "r",
      description: "Override the registry to use."
    }),

    help: flags.help({ char: "h" })
  };

  static args = [
    {
      name: "dir",
      default: ".",
      description: "The directory containing the package-lock.json file."
    }
  ];

  private registry: string | null = null;

  private useRegistry = (command: string) =>
    this.registry ? `${command} --registry ${this.registry}` : command;

  /**
   * Verify that the tarball URL on the remote server ends with .tgz
   *
   * @private
   * @memberof LockCheck
   */
  private checkRemoteURL = async (dep: string) => {
    const { stdout: tarballUrl } = await execa.command(
      this.useRegistry(`npm view ${dep} dist.tarball`)
    );

    if (!tarballUrl.endsWith(".tgz")) {
      throw new Error(`Remote artifact corrupted - ${tarballUrl}`);
    }
  };

  /**
   * Verify that the resolved URL in the package-lock file ends with .tgz
   *
   * @private
   * @memberof LockCheck
   */
  private checkLocalURL = (packageLock: PackageLock, dep: string) => {
    const { dependencies } = packageLock;

    const dependency = dependencies[dep];

    if (!dependency) {
      throw new Error(`${dep} not found in package-lock.json`);
    }

    const resolvedURL = dependency.resolved;

    if (!resolvedURL.endsWith(".tgz")) {
      throw new Error(
        `package-lock entry does not end in .tgz - ${resolvedURL}`
      );
    }
  };

  /**
   * Verify the local and remote dependency resolved URLs.
   *
   * @private
   * @memberof LockCheck
   */
  private checkPackage = async (
    packageLock: PackageLock,
    dependency: string
  ) => {
    this.checkLocalURL(packageLock, dependency);

    await this.checkRemoteURL(dependency);
  };

  /**
   * Run the NPM pack command on a dependency. This will trigger a GET request for the package but will not write the contents to disk.
   *
   * @private
   * @memberof LockCheck
   */
  private downloadPackage = async (dependency: string) => {
    await execa.command(this.useRegistry(`npm pack --dry-run ${dependency}`));
  };

  async run() {
    const { args, flags } = this.parse(LockCheck);

    const spinner = Ora();

    if (flags.registry) {
      spinner.info(`Using registry ${flags.registry}`);
      this.registry = flags.registry;
    }

    const tasks: Task[] = [
      {
        title: "Looking for package-lock.json",
        skip: false,
        task: async (ctx: Context) => {
          const filePath = path.resolve(ctx.projectPath, "package-lock.json");

          await fsa(filePath);

          ctx.packageLockPath = filePath;
        }
      },
      {
        title: "Reading package-lock.json",
        skip: false,
        task: async (ctx: Context) => {
          ctx.packageLock = await import(ctx.packageLockPath);
        }
      },
      {
        title: "Scanning package-lock.json",
        skip: false,
        task: async (ctx: Context, task: Task) => {
          return new Promise((resolve, reject) => {
            const { packageLock } = ctx;

            if (packageLock === null) {
              reject("packageLock is null");
              return;
            }

            const packages = Object.keys(packageLock.dependencies);

            spinner.info(`Found ${packages.length} dependencies`);

            spinner.text = task.title;

            let completed = 0;
            const total = packages.length;

            const q = Async.queue(async (dependency: string) => {
              if (!spinner.isSpinning) {
                spinner.start();
              }
              try {
                await this.checkPackage(packageLock, dependency);
              } catch (e) {
                throw e;
              } finally {
                completed++;
                spinner.text = `${task.title} - ${Math.round(
                  (completed / total) * 100
                )}%`;
              }
            }, 10);

            q.error((err, task) => {
              spinner.fail(`${task} - ${err}`);
            });

            q.drain(() => resolve());

            q.push(packages);
          });
        }
      },
      {
        title: "Downloading packages...",
        skip: flags.download === false,
        task: async (ctx: Context, task: Task) => {
          return new Promise(async (resolve, reject) => {
            const { packageLock } = ctx;

            if (packageLock === null) {
              reject("packageLock is null");
              return;
            }

            const packages = Object.keys(packageLock.dependencies);

            let completed = 0;
            const total = packages.length;

            const q = Async.queue(async (dependency: string) => {
              if (!spinner.isSpinning) {
                spinner.start();
              }
              try {
                await this.downloadPackage(dependency);
              } catch (e) {
                throw e;
              } finally {
                completed++;
                spinner.text = `${task.title} - ${Math.round(
                  (completed / total) * 100
                )}%`;
              }
            }, 10);

            q.error((err, task) => {
              spinner.fail(`${task} - ${err}`);
            });

            q.drain(() => resolve());

            q.push(packages);
          });
        }
      }
    ];

    const ctx = {
      projectPath: path.resolve(args.dir),
      packageLockPath: "",
      packageLock: null
    };

    for (let task of tasks) {
      if (task.skip) {
        continue;
      }

      spinner.text = task.title;
      spinner.start();

      try {
        await task.task(ctx, task);
        spinner.succeed();
      } catch (e) {
        spinner.fail();
        break;
      }
    }
  }
}

export = LockCheck;
