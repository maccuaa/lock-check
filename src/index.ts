import { Command, flags } from "@oclif/command";
import * as path from "path";
import * as fs from "fs";
import * as execa from "execa";
import * as Ora from "ora";
import * as Async from "async";

const fsa = (path: fs.PathLike, mode: number = fs.constants.R_OK) => {
  return new Promise((resolve, reject) => {
    // Execute the command, reject if we exit non-zero (i.e. error)
    fs.access(path, mode, function(err: NodeJS.ErrnoException | null) {
      if (err !== null) return reject(new Error(err.message));
      return resolve();
    });
  });
};

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
  title: string;
  task: (ctx: Context, task: Task) => Promise<void>;
}

class LockCheck extends Command {
  static description = "Verify the package-lock.json file in a project.";

  static flags = {
    version: flags.version({ char: "v" }),

    help: flags.help({ char: "h" })
  };

  static args = [
    {
      name: "dir",
      default: ".",
      description: "The directory containing the package-lock.json file."
    }
  ];

  private checkRemoteURL = async (dep: string) => {
    const { stdout: tarballUrl } = await execa.command(
      `npm view ${dep} dist.tarball`
    );

    if (!tarballUrl.endsWith(".tgz")) {
      throw new Error(`Remote artifact corrupted - ${tarballUrl}`);
    }
  };

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

  private checkPackage = async (
    packageLock: PackageLock,
    dependency: string
  ) => {
    this.checkLocalURL(packageLock, dependency);

    await this.checkRemoteURL(dependency);
  };

  async run() {
    const { args } = this.parse(LockCheck);

    const spinner = Ora();

    const tasks: Task[] = [
      {
        title: "Looking for package-lock.json",
        task: async ctx => {
          const filePath = path.resolve(ctx.projectPath, "package-lock.json");

          await fsa(filePath);

          ctx.packageLockPath = filePath;
        }
      },
      {
        title: "Reading package-lock.json",
        task: async ctx => {
          ctx.packageLock = await import(ctx.packageLockPath);
        }
      },
      {
        title: "Scanning package-lock.json",
        task: async (ctx, task) => {
          return new Promise((resolve, reject) => {
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
      }
    ];

    const ctx = {
      projectPath: path.resolve(args.dir),
      packageLockPath: "",
      packageLock: null
    };

    for (let task of tasks) {
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
