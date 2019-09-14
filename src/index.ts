import { Command, flags } from "@oclif/command";
import * as path from "path";
import * as fs from "fs";
import * as execa from "execa";
import * as Listr from "listr";

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
    [depName: string]: {
      version: string;
      resolved: string;
      integrity: string;
    };
  };
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

  private getTarballUrl = async (dep: string) => {
    const { stdout: tarballUrl } = await execa.command(
      `npm view ${dep} dist.tarball`
    );

    if (!tarballUrl.endsWith(".tgz")) {
      throw new Error(`Remote artifact corrupted - ${tarballUrl}`);
    }
  };

  async run() {
    const { args } = this.parse(LockCheck);

    const tasks = new Listr([
      {
        title: `Looking for package-lock.json`,
        task: async (ctx: {
          projectPath: string;
          packageLockPath: string;
          packageLock: PackageLock | null;
        }) => {
          const filePath = path.resolve(ctx.projectPath, "package-lock.json");

          await fsa(filePath);

          ctx.packageLockPath = filePath;
        }
      },
      {
        title: "Reading package-lock.json",
        task: async (ctx: {
          projectPath: string;
          packageLockPath: string;
          packageLock: PackageLock | null;
        }) => {
          ctx.packageLock = await import(ctx.packageLockPath);
        }
      },
      {
        title: "Scanning package-lock.json",
        task: async ctx => {
          const { packageLock } = ctx;

          if (packageLock === null) {
            return;
          }

          const packages = Object.keys(packageLock.dependencies);

          const nextTenPackages = packages.splice(0, 10);

          const packageToTask = (dependency: string) => ({
            title: dependency,
            task: async () => {
              const resolvedURL = packageLock.dependencies[dependency].resolved;

              if (!resolvedURL.endsWith(".tgz")) {
                throw new Error(
                  `package-lock entry does not end in .tgz - ${resolvedURL}`
                );
              }

              await this.getTarballUrl(dependency);

              if (packages.length > 0) {
                const nextPackage = packages.splice(0, 1)[0];
                tasks.add(packageToTask(nextPackage));
              }
            }
          });

          const tasks = new Listr(nextTenPackages.map(packageToTask), {
            exitOnError: false
          });

          return tasks;
        }
      }
    ]);

    tasks
      .run({
        projectPath: path.resolve(args.dir),
        packageLockPath: "",
        packageLock: null
      })
      .catch(() => {
        // ignore
      });
  }
}

export = LockCheck;
