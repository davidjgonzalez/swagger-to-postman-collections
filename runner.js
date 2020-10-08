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
                        'Authorization': 'Bearer {{ACCESS_TOKEN}}', // Header
                        'x-sandbox-name': '{{SANDBOX_NAME}}' // Sandbox name (prod, or custom)
                    },
                    formData: {
                        'client_id': '{{API_KEY}}',
                        'client_secret': '{{CLIENT_SECRET}}',
                        'jwt_token': '{{JWT_TOKEN}}',
                        'technical_account_id': '{{TECHNICAL_ACCOUNT_ID}}',
                        'meta_scopes': '{{META_SCOPE}}',
                        'private_key': '{{PRIVATE_KEY}}'
                    }
                },
                basePath: {
                    // Missing bathPath attribute in swagger spec; mapping via Title
                    'Schema Registry API': '/data/foundation/schemaregistry',
                    'Catalog Service API': '/data/foundation/catalog',
                    'Partner Connectors API': '/data/foundation/connectors',
                    'Data Ingestion API': '/data/foundation/import',
                    'Data Access API': '/data/foundation/export',
                    'DULE Policy Service': '/data/foundation/dulepolicy',
                    'Privacy Service API': '/data/core/privacy/jobs',
                    'Real-time Customer Profile API': '/data/core/ups',
                    'Identity Service': '/data/core',
                    'Query Service API': '/data/foundation/query',
                    'XDM Core Object Repository API': '/data/core/xcore',
                    'Offer Decision Service API': '/data/core/ode',
                    'Sensei Machine Learning API': '/data/sensei',
                    'Access Control API': '/data/foundation/access-control',
                    'Mapping Service API Resource': '/data/foundation/connectors',
                    'Observability Insights': '/data/infrastructure/observability/insights',
                    'Sandbox API': '/data/foundation/sandbox-management'
                }, 
                forcedParams: [
                    {
                        id: 'x-sandbox-name',
                        name: 'x-sandbox-name',
                        in: 'header',
                        required: false,
                        description: 'Identifies the Adobe Experience Platform sandbox to use. Default sandbox is \'prod\'',
                        type: 'string',
                        enabled: true,
                        overwrite: function() { return false; }
                    },
                    {
                        id: 'accept',
                        name: 'Accept',
                        description: 'The desired response format (application/vnd.adobe.xed-full+json; version=1). \'Version\' is required.',
                        in: 'header',
                        default: 'application/vnd.adobe.xed+json; version=1',
                        required: true,
                        overwrite: function(apiPathId, path, method) { 
                            return apiPathId === '/data/foundation/schemaregistry' && 
                                    method === 'GET' && 
                                    path.indexOf('$id') > -1; //contains $id -- (GET + :id) endpoints would be: application/vnd.adobe.xed+json; version=1

                        }
                    },
                    {
                        id: 'accept',
                        name: 'Accept',
                        description: 'The desired response format (application/vnd.adobe.xed-full+json).',
                        in: 'header',
                        default: 'application/vnd.adobe.xed-id+json',
                        required: true,
                        overwrite: function(apiPathId, path, method) { 
                            return apiPathId === '/data/foundation/schemaregistry' && 
                                    method === 'GET' && 
                                    path.indexOf('$id') === -1; // does NOT contain $id -- (GET) endpoints would be: application/vnd.adobe.xed-id+json
                        }
                    }
                ],
                blacklistedParams: [  
                    {
                        name: 'x-sandbox-id',
                        in: 'header',
                    }
                ],
                preRequestScript: 
`/** Begin Adobe-provided Pre-Request Scripts **/
// Do not send HTTP Headers with empty variables, as Postman will send the literal variable name
pm.request.headers.each(header => {
    if (header.value.startsWith("{{") && header.value.endsWith("}}")) {
        if (!pm.variables.get(header.value.substring(2, header.value.length - 2))) { pm.request.headers.remove(header.key); }
    }
});

// Do not send HTTP URL Query Parameters with empty variables, as Postman will send the literal variable name
pm.request.url.query.remove(q => { 
    if (q.value.startsWith("{{") && q.value.endsWith("}}")) {
        return !pm.variables.get(q.value.substring(2, q.value.length - 2));
    } 
});
/** End Adobe-provided Pre-Request Scripts **/`
            }),
            conversionResult;

        fs.readFile(inputFilePath, (err, data) => {
            if (err) throw err;

            conversionResult = swaggerConverter.convert(yaml.safeLoad(data));

            if (conversionResult.status === "passed") {

                fileNameWithoutExtension = conversionResult.collection.name || fileNameWithoutExtension;
                var outputFileName = '';
                
                if (outputDirectory.indexOf('/') === 0) {
                    // Is absolute path
                    outputFileName = path.resolve(outputDirectory + '/' + fileNameWithoutExtension + '.postman_collection.json');
                } else {
                    // Is relative path
                    outputFileName = path.resolve('./' + outputDirectory + '/' + fileNameWithoutExtension + '.postman_collection.json');
                }

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