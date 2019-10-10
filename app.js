#!/usr/bin/env node

global.__basedir = __dirname;

const Runner = require('./runner.js'),
    yargs = require('yargs'),
    fs = require('fs'),
    argv = yargs
    .option('input', {
        alias: 'if',
        description: 'Input yaml file or directory containing yaml swagger spec files. Required parameter.',
        type: 'string',
    })
    .option('output', {
        alias: 'od',
        description: 'Output directory. Optional, defaults to `./postman-collections`',
        type: 'string',
    })
    .help()
    .alias('help', 'h')
    .argv;

const LINE_LENGTH = 100;

var output = argv.output || './postman-collections'
inputExists = fs.existsSync(argv.input);
inputFile = false;

if (inputExists) {
    inputIsFile = fs.statSync(argv.input).isFile(),
        inputIsDirectory = !inputIsFile;
}

try {
    if (!inputExists) {
        console.error("*".repeat(LINE_LENGTH));
        console.error("You must provide an input file or directory via the --input parameter");
        console.error("*".repeat(LINE_LENGTH));

    } else if (inputIsFile) {
        Runner.executeOnFile(argv.input, output);
    } else if (inputIsDirectory) {
        Runner.executeOnDirectory(argv.input, output);
    } else {
        Runner.executeOnDirectory('.', output);
    }
} catch (err) {
    console.error("Error converting one or all of the YAML swagger files to postman collections");
    console.error(err);
}