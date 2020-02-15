lock-check
==========

Verify that all the packages in your package-lock.json file exist.

This tool is for when you're using a repository other than NPM such as Artifactory where packages can become corrupted or URLs mangled.

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://badgen.net/npm/v/@maccuaa/lock-check)](https://npmjs.org/package/@maccuaa/lock-check)
[![Bundle Size](https://badgen.net/bundlephobia/minzip/@maccuaa/lock-check)](https://npmjs.org/package/@maccuaa/lock-check) [![Greenkeeper badge](https://badges.greenkeeper.io/maccuaa/lock-check.svg)](https://greenkeeper.io/)

<!-- toc -->

# Install

```shell
npm i -g @maccuaa/lock-check
```

# Usage

```shell
# Scan the current directory
lock-check

# Scan a different directory
lock-check path/to/directory

# Help
lock-check --help
```
