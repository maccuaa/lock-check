import { Command, flags } from "@oclif/command";
import * as path from "path";
import * as execa from "execa";
import * as Async from "async";
import cli from "cli-ux";
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
}

interface Task {
  title: string;
  task: (ctx: Context, task: Task) => Promise<void>;
}

const NPM_URL = "https://registry.npmjs.org";

class LockCheck extends Command {
  static description =
    "Download all the packages in your package-lock.json using an Artifactory repository.";

  static flags = {
    version: flags.version({ char: "v" }),

    registry: flags.string({
      char: "r",
      description: "The Artifactory registry to use.",
      required: true,
    }),

    help: flags.help({ char: "h" }),
  };

  static args = [
    {
      name: "dir",
      default: ".",
      description: "The directory containing the package-lock.json file.",
    },
  ];

  async run() {
    const { args, flags } = this.parse(LockCheck);

    const username = await cli.prompt("Artifactory username", {
      required: true,
    });
    const password = await cli.prompt("Artifactory password", {
      required: true,
      type: "hide",
    });

    const tasks: Task[] = [
      {
        title: "🔎 Looking for package-lock.json",
        task: async (ctx: Context) => {
          const filePath = path.resolve(ctx.projectPath, "package-lock.json");

          // make sure the file exists and the user can read it.
          await fsa(filePath);

          ctx.packageLockPath = filePath;
        },
      },
      {
        title: "🔥 Downloading packages...",
        task: async (ctx: Context, task: Task) => {
          return new Promise(async (resolve) => {
            // import the package-lock.json file
            const packageLock: PackageLock = await import(ctx.packageLockPath);

            // Get the list of dependencies
            const dependencies = Object.keys(packageLock.dependencies);

            // Get the total number of dependencies
            const total = dependencies.length;

            // Create and start the progress bar
            const progress = cli.progress();
            progress.start(total, 0);

            // Create an Async queue for processing all the dependencies
            const q = Async.queue(async (dependencyName: string) => {
              try {
                const { resolved } = packageLock.dependencies[dependencyName];

                const downloadURL = resolved.replace(NPM_URL, flags.registry);

                const args = [];

                args.push("-u", `'${username}:${password}'`);

                args.push(downloadURL);

                await execa("curl", args, { shell: true });
              } catch (e) {
                throw e;
              } finally {
                progress.increment();
              }
            }, 10);

            q.drain(() => {
              progress.stop();
              resolve();
            });

            q.push(dependencies);
          });
        },
      },
    ];

    const ctx: Context = {
      projectPath: path.resolve(args.dir),
      packageLockPath: "",
    };

    for (let task of tasks) {
      try {
        await task.task(ctx, task);
      } catch (e) {
        console.error(e);
        break;
      }
    }
  }
}

export = LockCheck;
