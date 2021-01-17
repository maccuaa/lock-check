# lock-check

Download all the packages in your package-lock.json using an Artifactory repository.

Artifactory fails regularly on NPM integrity checks when pulling content down from remote repositories. Use this tool to get around the issue.

Run a local build pulling from the public NPM regristry (i.e. not configured to use Artifactory), then run this tool.

This tool will:

- Parse out the download links
- Download those files using wget from the Artifactory repo you provide.

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://badgen.net/npm/v/@maccuaa/lock-check)](https://npmjs.org/package/@maccuaa/lock-check)
[![Bundle Size](https://badgen.net/bundlephobia/minzip/@maccuaa/lock-check)](https://npmjs.org/package/@maccuaa/lock-check)

# Install

```shell
npm i -g @maccuaa/lock-check
```

<!-- toc -->
