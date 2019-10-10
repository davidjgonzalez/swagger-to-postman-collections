const yaml = require('js-yaml'),
    fs = require('fs'),
    transformer = require('postman-collection-transformer'),
    path = require('path'),
    Swagger2Postman = require('./convert'),
    postmanCollectionTransformerOptions = {
        inputVersion: '1.0.0',
        outputVersion: '2.1.0',
        retainIds: true // the transformer strips request-ids etc by default.
    };

function executeOnFile(inputFile, outputDirectory) {
    var fileName = path.resolve(__dirname, inputFile);

    execute(fileName, outputDirectory);
}

function executeOnDirectory(inputDirectory, outputDirectory) {

    var directoryName = path.resolve(__dirname, inputDirectory);

    fs.readdir(directoryName, function (err, fileNames) {
        if (err) throw err;

        fileNames.forEach(fileName => {
            execute(path.resolve(directoryName, fileName), outputDirectory);
        });
    });

}

function execute(inputFilePath, outputDirectory) {
    if (!fs.existsSync(outputDirectory)) {
        fs.mkdirSync(outputDirectory);
    }

    const fileName = path.basename(inputFilePath);

    if (path.extname(inputFilePath) === '.yaml') {

        var fileNameWithoutExtension = fileName.substring(0, fileName.lastIndexOf(".")),

            swaggerConverter = new Swagger2Postman({
                scheme: 'https',
                folderName: 'tags',
                transforms: {
                    header: {
                        'x-api-key': '{{API_KEY}}', // Header
                        'x-gw-ims-org-id': '{{IMS_ORG}}', // Header
                        'Authorization': 'Bearer {{ACCESS_TOKEN}}' // Header
                    },
                    formData: {
                        'client_id': '{{API_KEY}}',
                        'client_secret': '{{CLIENT_SECRET}}',
                        'jwt_token': '{{JWT_TOKEN}}',
                        'technical_account_id': '{{TECHNICAL_ACCOUNT_ID}}',
                        'meta_scopes': '{{META_SCOPE}}',
                        'private_key': '{{PRIVATE_KEY}}'
                    }
                }
            }),
            conversionResult;

        fs.readFile(inputFilePath, (err, data) => {
            if (err) throw err;

            //swaggerConverter.setLogger(console.log);
            conversionResult = swaggerConverter.convert(yaml.safeLoad(data));

            if (conversionResult.status === "passed") {

                fileNameWithoutExtension = conversionResult.collection.name || fileNameWithoutExtension;
                var outputFileName = path.resolve('./' + outputDirectory + '/' + fileNameWithoutExtension + '.postman_collection.json');

                if (fs.existsSync(outputFileName)) {
                    fs.unlinkSync(outputFileName);
                } else {
                    console.error("Failed to remove existing file  [" + outputFileName + " ]");
                }

                transformer.convert(conversionResult.collection, postmanCollectionTransformerOptions, function (error, result) {
                    if (error) {
                        return console.error(error);
                    }

                    fs.writeFileSync(outputFileName, JSON.stringify(result, null, '\t'));
                    console.log('Successfully converted [ ' + fileName + '] to postman collection at [' + outputFileName + ' ]');
                });
            } else {
                console.error("Conversion failed for " + fileName);
            }
        });
    }

};

module.exports = {
    executeOnFile: executeOnFile,
    executeOnDirectory: executeOnDirectory
};