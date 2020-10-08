# Swagger to Postman Collections

This is a command line invoked npm module that converts Swagger 2.0 YAML Spaces to Postman Collections v2.1.0.

> This is an adaptation and extension of the Postman Labs provided __swagger2-to-postman__ library.
> https://github.com/postmanlabs/swagger2-postman.git

## Usage

* `--input <relative/absolute path to YAML file OR to directory containing all YAML files to process>`
* `--output <relative or absolute path to folder where postman collections should be created>`

To invoke...

`$ ./app.js --input /path/to/yaml/specs --output /path/to/save/postman-collections`
