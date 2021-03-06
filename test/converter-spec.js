var expect = require('expect.js'),
    Swagger2Postman = require('../convert.js'),
    fs = require('fs'),
    path = require('path');

/* global describe, it */
describe('the converter', function () {
    var samples = fs.readdirSync(path.join(__dirname, 'data'));

    samples.map(function (sample) {
        var samplePath = path.join(__dirname, 'data', sample);
        it('must convert ' + samplePath + ' to a postman collection', function () {
            var swagger = require(samplePath),
                converter = new Swagger2Postman(),
                convertResult = converter.convert(swagger);

            expect(convertResult.status).to.be('passed');
        });
    });

    it('must read values from the "x-postman-meta" key', function () {
        var samplePath = path.join(__dirname, 'data', 'swagger_aws.json'),
            swagger = require(samplePath),
            converter = new Swagger2Postman(),
            convertResult = converter.convert(swagger);
        // Make sure that currentHelper and helperAttributes are processed
        expect(convertResult.collection.requests[0]).to.have.key('currentHelper');
        expect(convertResult.collection.requests[0]).to.have.key('helperAttributes');
    });

    it('must read values consumes/produces', function () {
        var samplePath = path.join(__dirname, 'data', 'swagger_aws_2.json'),
            swagger = require(samplePath),
            converter = new Swagger2Postman(),
            convertResult = converter.convert(swagger),
            request = convertResult.collection.requests[0];
        // Make sure that currentHelper and helperAttributes are processed
        expect(request.headers.indexOf('Accept: text/json') > -1).to.be(true);
        expect(request.headers.indexOf('Content-Type: application/json') > -1).to.be(true);
    });

    it('should obey the includeQueryParams option', function () {
        var options = {
                includeQueryParams: false
            },
            samplePath = path.join(__dirname, 'data', 'sampleswagger.json'),
            swagger = require(samplePath),
            converterWithOptions = new Swagger2Postman(options),
            convertWithOptionsResult = converterWithOptions.convert(swagger),
            converterWithoutOptions = new Swagger2Postman(),
            convertWithoutOptionsResult = converterWithoutOptions.convert(swagger);
        // Make sure that currentHelper and helperAttributes are processed

        expect(convertWithoutOptionsResult.collection.requests[2].url.indexOf('status=available') > -1).to.be(true);
        expect(convertWithOptionsResult.collection.requests[3].url.indexOf('{') == -1).to.be(true);
        expect(convertWithoutOptionsResult.collection.requests[3].url.indexOf('{') > 0).to.be(true);
    });

    it('should convert path parameters to postman-compatible parameters', function () {
        var samplePath = path.join(__dirname, 'data', 'swagger2-with-params.json'),
            swagger = require(samplePath),
            converter = new Swagger2Postman(),
            convertResult = converter.convert(swagger);

        expect(convertResult.collection.requests[0].pathVariables.ownerId == '42').to.be(true);
        expect(convertResult.collection.requests[0].url.indexOf(':ownerId') > -1).to.be(true);
        expect(convertResult.collection.requests[0].url.indexOf(':petId') > -1).to.be(true);
    });

    it('should convert path parameters to postman-compatible parameters', function () {
        var samplePath = path.join(__dirname, 'data', 'swagger2-with-inherited-params.json'),
            swagger = require(samplePath),
            converter = new Swagger2Postman(),
            convertResult = converter.convert(swagger);

        expect(convertResult.collection.requests[0].pathVariables.operationParameter).to.be('{{operationParameter}}');
        expect(convertResult.collection.requests[0].pathVariables.resourceParameter).to.be('{{resourceParameter}}');
        expect(convertResult.collection.requests[0].pathVariables.unusedParameter).to.be(undefined);
        expect(convertResult.collection.requests[0].pathVariables.referencedParameter).to.be('{{referencedParameter}}');
    });

    it('should transform parameters based on options.transforms', function () {
        var samplePath = path.join(__dirname, 'data', 'swagger2-with-transformed-params.json'),
            swagger = require(samplePath),
            converter = new Swagger2Postman({
                transforms: {
                    header: {
                        'api-key': '{{API_KEY}}',
                        'Authorization': 'Bearer {{ACCESS_TOKEN}}',
                        'withDefaultValue': '{{WITH_DEFAULT_VALUE}}'
                    },
                    path: {
                        'ownerId': '{{OWNER_ID}}'
                    }
                }
            }),
            convertResult = converter.convert(swagger);

        expect(convertResult.collection.requests[0].pathVariables.ownerId).to.be('{{OWNER_ID}}');
        expect(convertResult.collection.requests[0].pathVariables.petId).to.be('{{petId}}');
        expect(convertResult.collection.requests[0].headers).to.be(
                'api-key: {{API_KEY}}\nAuthorization: Bearer {{ACCESS_TOKEN}}\nwithDefaultValue: 42\n');
    });
});
