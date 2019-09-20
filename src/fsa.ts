import * as fs from "fs";

const fsa = (path: fs.PathLike, mode: number = fs.constants.R_OK) => {
  return new Promise((resolve, reject) => {
    // Execute the command, reject if we exit non-zero (i.e. error)
    fs.access(path, mode, function(err: NodeJS.ErrnoException | null) {
      if (err !== null) return reject(new Error(err.message));
      return resolve();
    });
  });
};

export default fsa;
