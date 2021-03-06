var uuidv4 = require('uuid/v4'),
    getUuid = require('uuid-by-string'),
    jsface = require('jsface'),
    url = require('url'),
    META_KEY = 'x-postman-meta',

    ConvertResult = function (status, message) {
        this.status = status;
        this.message = message;
    },

    Swagger2Postman = jsface.Class({
        constructor: function (options) {
            this.collectionJson = {
                'id': '',
                'name': '',
                'description': '',
                'order': [],
                'folders': [],
                'timestamp': 1413302258635,
                'synced': false,
                'requests': []
            };
            this.tags = {};
            this.basePath = '';
            this.collectionId = '';
            this.folders = {};
            // Base parameters are the reference-able collection parameters
            this.baseParams = {};
            // Resource parameters are shared to all operations under the resource
            this.resourceParams = {};
            this.logger = function () {
            };

            this.options = options || {};
            this.transforms = this.options.transforms || {};
            this.basePath = this.options.basePath || {};
            this.forcedParams = this.options.forcedParams || [];

            this.options.includeQueryParams = typeof (this.options.includeQueryParams) == 'undefined' ?
                true : this.options.includeQueryParams;
        },

        setLogger: function (func) {
            this.logger = func;
        },

        validate: function (json) {
            if (!json.hasOwnProperty('swagger') || json.swagger !== '2.0') {
                return new ConvertResult('failed', 'Must contain a swagger field (2.0)');
            }

            if (!json.hasOwnProperty('info')) {
                return new ConvertResult('failed', 'Must contain an info object');
            }
            else {
                var info = json.info;
                if (!info || !info.title) {
                    return new ConvertResult('failed', 'Must contain info.title');
                }
            }

            return new ConvertResult('passed', '');
        },

        transformParameter: function (parameter, transforms) {
            transforms = transforms || {};

            if (parameter in transforms) {
                return transforms[parameter];
            }
            else {
                return '{{' + parameter + '}}';
            }
        },

        getPostmanVariable: function (thisParams, param, transforms) {
            var postmanVariableName = this.transformParameter(thisParams[param].name, transforms),
            // Get default value for .in = query/header/path/formData
            defaultVal = postmanVariableName;

            if (thisParams[param].hasOwnProperty('default')) {
                defaultVal = thisParams[param].default;
            }

            return defaultVal;
        },

        setBasePath: function (json) {
            this.basePath = '';
            if (json.host) {
                this.basePath = json.host;
            } else {
                this.basePath = 'platform.adobe.io';
            }

            if (json.basePath) {
                this.basePath += json.basePath;
            } else if (this.options.basePath[json.info.title]) {
                // Set basePath using param transforms for any Swagger Spec  missing the basePath (ideally this is added INTO the swagger spec yaml)
                this.basePath += this.options.basePath[json.info.title];
            }

            if (this.options.scheme === 'https' || (json.schemes && json.schemes.indexOf('https') != -1)) {
                this.basePath = 'https://' + this.basePath;
            }
            else {
                this.basePath = 'http://' + this.basePath;
            }

            if (!this.endsWith(this.basePath, '/')) {
                this.basePath += '/';
            }
        },

        getFolderName: function(operation, pathUrl) {
            if (this.options.folderName === 'tags' && 
                    operation.tags && 
                    operation.tags.length > 0 &&
                    operation.tags[0]) {
                
                var folderName = operation.tags[0];
                if (!this.folders[folderName]) {
                    this.folders[folderName] = this.createNewFolder(folderName);
                }
                this.logger('For path ' + pathUrl + ', returning folderName ' + this.folders[folderName].name);
                return this.folders[folderName].name;
            } else {
                return this.getFolderNameForPath(pathUrl);
            }
        },

        getFolderNameForPath: function (pathUrl) {
            if (pathUrl == '/') {
                return null;
            }

            var segments = pathUrl.split('/'),
                numSegments = segments.length,
                folderName = null;

            this.logger('Getting folder name for path: ' + pathUrl);
            this.logger('Segments: ' + JSON.stringify(segments));

            if (numSegments > 1) {
                folderName = segments[1];

                // create a folder for this path url
                if (!this.folders[folderName]) {
                    this.folders[folderName] = this.createNewFolder(folderName);
                }
                this.logger('For path ' + pathUrl + ', returning folderName ' + this.folders[folderName].name);
                return this.folders[folderName].name;
            }
            else {
                this.logger('Error - path MUST begin with /');
                return null;
            }
        },

        createNewFolder: function (name) {
            var description = "Folder for " + name;
            this.tags.forEach(function(tag) {
                if (tag.name === name && tag.description) {
                    description = tag.description;
                }
            });

            var newFolder = {
                'id': getUuid('aep__' + name + '__' + this.collectionId), //uuidv4(),
                'name': name,
                'description': description,
                'order': [],
                'collection_name': this.collectionJson.name,
                'collection_id': this.collectionId,
                'collection': this.collectionId
            };

            this.logger('Created folder ' + newFolder.name);
            return newFolder;
        },

        handleInfo: function (json) {
            this.collectionJson.name = json.info.title;
            this.collectionJson.description = json.info.description;
        },

        getParamsForPathItem: function (params) {
            var retVal = {},
                numParams,
                i,
                parts,
                lastPart;

            // Ensure params are arrays of objects.
            // The param be single-level nested objects if they come from the retVal of this method!

            if (this.isObject(params)) {
                params = this.paramsObjectToArray(params);
            }

            params = params || [];

            numParams = params.length;

            for (i = 0; i < numParams; i++) {
                if (params[i].$ref) {
                    // this is a ref
                    if (params[i].$ref.indexOf('#/parameters') === 0) {
                        parts = params[i].$ref.split('/');
                        lastPart = parts[parts.length - 1];
                        retVal[lastPart] = this.baseParams[lastPart];
                    }
                }
                else {
                    retVal[params[i].name] = params[i];
                }
            }

            return retVal;
        },

        addOperationToFolder: function (path, method, operation, folderName) {
            var root = this,
                request = {
                    'id': getUuid('aep__' + path + '__' + method + '__' + operation + '__' + folderName + '__' + root.collectionId), //uuidv4(),
                    'headers': [],
                    'url': '',
                    'pathVariables': {},
                    'preRequestScript': this.options.preRequestScript,
                    'method': 'GET',
                    'data': [],
                    'rawModeData': null,
                    'dataMode': 'params',
                    'description': operation.description || '',
                    'descriptionFormat': 'html',
                    'time': '',
                    'version': 2,
                    'responses': [],
                    'tests': '',
                    'collectionId': root.collectionId,
                    'synced': false
                },
                thisParams = this.getParamsForPathItem(
                    this.mergeObjectArrays(this.resourceParams, operation.parameters)),
                hasQueryParams = false,
                param,
                requestAttr,
                thisConsumes = root.globalConsumes,
                thisProduces = root.globalProduces,
                tempBasePath,
                transforms = this.options.transforms || {};

            if (path.length > 0 && path[0] === '/') {
                path = path.substring(1);
            }

            // Problem here
            // url.resolve("http://host.com/", "/api") returns "http://host.com/api"
            // but url.resolve("http://{{host}}.com/", "/api") returns "http:///%7B..host.com/api"
            // (note the extra slash after http:)
            // request.url = decodeURI(url.resolve(this.basePath, path));
            tempBasePath = this.basePath
                .replace(/{{/g, 'POSTMAN_VARIABLE_OPEN_DB')
                .replace(/}}/g, 'POSTMAN_VARIABLE_CLOSE_DB');

            request.url = decodeURI(url.resolve(tempBasePath, path))
                .replace(/POSTMAN_VARIABLE_OPEN_DB/gi, '{{')
                .replace(/POSTMAN_VARIABLE_CLOSE_DB/gi, '}}');

            request.method = method;
            request.name = operation.summary;
            request.time = (new Date()).getTime();

            // Handle custom swagger attributes for postman aws integration
            if (operation[META_KEY]) {
                for (requestAttr in operation[META_KEY]) {
                    if (operation[META_KEY].hasOwnProperty(requestAttr)) {
                        request[requestAttr] = operation[META_KEY][requestAttr];
                    }
                }
            }

            if (operation.produces) {
                thisProduces = operation.produces;
            }

            if (operation.consumes) {
                thisConsumes = operation.consumes;
            }
            
            if (thisProduces.length > 0) {                    
                request.headers.push({
                    'key': 'Accept',
                    'value': thisProduces.join(', ') //'application/vnd.adobe.xed+json' 
                });
            }

            if (thisConsumes.length > 0) {
                request.headers.push({
                    'key': 'Content-Type',
                    'value': thisConsumes[0] //'application/json'
                });
            }            
            // set the default dataMode for this request, even if it doesn't have a body
            // eg. for GET requests
            if (thisConsumes.indexOf('application/x-www-form-urlencoded') > -1) {
                request.dataMode = 'urlencoded';
            }

            for (i = 0; i < this.forcedParams.length; i++) {
                var forcedParam = this.forcedParams[i],
                    apiPathId = '/' + this.basePath.split('/').slice(3).join('/');
                    apiPathId = apiPathId.substring(0, apiPathId.length - 1); 
        

                if (!forcedParam) {
                    continue;
                }

                var hasForcedParam = false;
                for (param in thisParams) {
                    if (thisParams[param]) {                        
                        if (thisParams[param].in === forcedParam.in && thisParams[param].name === forcedParam.name) {
                            hasForcedParam = true;
                            if (forcedParam.overwrite(apiPathId, path, method)) {
                                thisParams[param] = forcedParam; 
                            }
                        }
                    }
                }

                // Do not add in Accept or Content-Type 
                if (!hasForcedParam && 
                        !(forcedParam.in === 'header' && ['Accept', 'Content-Type'].indexOf(forcedParam.name) > -1)) {
                    // Means there was nothing to overwrite of 
                    thisParams[forcedParam.name + "_SwaggerToPostmanForcedParam"] = forcedParam;
                    hasForcedParam = true;
                }
            };

            // set data and headers
            for (param in thisParams) {
                if (thisParams.hasOwnProperty(param) && thisParams[param]) {

                    for (i = 0; i < (this.options.blacklistedParams || []).length; i++) {
                        var blacklistedParam = this.options.blacklistedParams[i];
                        if ((thisParams[param].in === blacklistedParam.in && thisParams[param].name === blacklistedParam.name)) {
                            return;
                        }
                    }
        
                    if (thisParams[param].in === 'query' && this.options.includeQueryParams !== false) {
                        if (!hasQueryParams) {
                            hasQueryParams = true;
                            request.url += '?';
                        }

                        request.url += thisParams[param].name +
                            '=' +
                            this.getPostmanVariable(thisParams, param, transforms.query) +
                            '&';                        
                    }
                    else if (thisParams[param].in === 'header') {
                        // Skip these Headers as they are always forced to be what they (removed Accept incase it was forced)
                        if (['Content-Type'].indexOf(thisParams[param].name) === -1) {        
                       
                            var overwroteHeader = false;
                            for (var hi = 0; hi < request.headers.length; hi++) {
                                if (thisParams[param].name === request.headers[hi].key) {

                                    if (thisParams[param].overwrite && thisParams[param].overwrite(apiPathId, path, method)) {                              
                                        // Overwrite existing headers
                                        request.headers[hi] = {
                                            'key': thisParams[param].name,
                                            'value': this.getPostmanVariable(thisParams, param, transforms.header),
                                            'description': thisParams[param].description || '',
                                            'type': thisParams[param].type || 'string',
                                            'enabled': typeof thisParams[param].enabled === 'undefined' ? true : thisParams[param].enabled
                                        };
                                        
                                        overwroteHeader = true;
                                        break;
                                    }
                                }                            
                            }

                            if (!overwroteHeader) {
                                request.headers.push({
                                    'key': thisParams[param].name,
                                    'value': this.getPostmanVariable(thisParams, param, transforms.header),
                                    'description': thisParams[param].description || '',
                                    'type': thisParams[param].type || 'string',
                                    'enabled': typeof thisParams[param].enabled === 'undefined' ? true : thisParams[param].enabled
                                });
                            }
                        }                        
                    }
                    else if (thisParams[param].in === 'body') {
                        request.dataMode = 'raw';
                        request.rawModeData = this.getPostmanVariable(thisParams, param, transforms.body);
                    }
                    else if (thisParams[param].in === 'formData') {
                        if (thisConsumes.indexOf('application/x-www-form-urlencoded') > -1) {
                            request.dataMode = 'urlencoded';
                        }
                        else {
                            request.dataMode = 'params';
                        }
                        request.data.push({
                            'key': thisParams[param].name,
                            'value': this.getPostmanVariable(thisParams, param, transforms.formData),
                            'description': thisParams[param].description || '',
                            'type': 'text',
                            'enabled': true
                        });
                    }
                    else if (thisParams[param].in === 'path') {
                        if (!request.hasOwnProperty('pathVariables')) {
                            request.pathVariables = {};
                        }
                        request.pathVariables[thisParams[param].name] =
                                this.getPostmanVariable(thisParams, param, transforms.path);
                    }
                }
            }

            if (hasQueryParams && this.endsWith(request.url, '&')) {
                request.url = request.url.slice(0, -1);
            }

            this.collectionJson.requests.push(request);
            if (folderName !== null) {
                this.folders[folderName].order.push(request.id);
            }
            else {
                this.collectionJson.order.push(request.id);
            }
        },

        addPathItemToFolder: function (path, pathItem) {
            if (pathItem.$ref) {
                this.logger('Error - cannot handle $ref attributes');
                return;
            }

            var paramsForPathItem = this.getParamsForPathItem(
                this.mergeObjectArrays(pathItem.parameters, this.resourceParams)),
                acceptedPostmanVerbs = [
                    'get', 'put', 'post', 'patch', 'delete', 'copy', 'head', 'options',
                    'link', 'unlink', 'purge', 'lock', 'unlock', 'propfind', 'view'],
                numVerbs = acceptedPostmanVerbs.length,
                i,
                verb;

            // replace path variables {petId} with :petId
            if (path) {
                path = path.replace(/{/g, ':').replace(/}/g, '');
            }

            for (i = 0; i < numVerbs; i++) {
                verb = acceptedPostmanVerbs[i];
                if (pathItem[verb]) {
                    this.logger('Adding Operation to Folder: ' + verb.toUpperCase() + ' ' + path);

                    this.addOperationToFolder(
                        path,
                        verb.toUpperCase(),
                        pathItem[verb],
                        this.getFolderName(pathItem[verb], path),
                        paramsForPathItem
                    );
                }
            }
        },

        handlePaths: function (json) {
            var i,
                paths = json.paths,
                path;
                
            // Add a folder for each path
            for (path in paths) {
                if (paths.hasOwnProperty(path)) {
                    //this.logger('Adding path item. path = ' + path + ' folder = ' + this.getFolderNameForPath(paths[path], path));

                    // Update a specific Operations parameters with any parent Resource parameters.
                    this.resourceParams = [];

                    if (path.startsWith('/')) {
                        if (paths[path].parameters) {
                            for (i = 0; i < paths[path].parameters.length; i++) {
                                this.resourceParams.push(paths[path].parameters[i]);
                            }
                        }
                        //this.addPathItemToFolder(path, paths[path], folderName);
                        this.addPathItemToFolder(path, paths[path]);
                    }
                }
            }
        },

        handleParams: function (params, level) {
            if (!params) {
                return;
            }
            if (level === 'collection') {
                // base params
                for (var param in params) {
                    if (params.hasOwnProperty(param)) {
                        this.logger('Adding collection param: ' + param);
                        this.baseParams[param] = params[param];
                    }
                }
            }
        },

        addFoldersToCollection: function () {
            var folderName;
            for (folderName in this.folders) {
                if (this.folders.hasOwnProperty(folderName)) {
                    this.collectionJson.folders.push(this.folders[folderName]);
                }
            }
        },

        convert: function (json) {
            var validationResult = this.validate(json);
            if (validationResult.status === 'failed') {
                // error
                return validationResult;
            }

            this.collectionId = getUuid('aep__' + json.info.title); //uuidv4();

            this.globalConsumes = json.consumes || [];

            this.globalProduces = json.produces || [];

            this.tags = json.tags || [];

            // Pull reference-able parameter definitions into memory
            this.handleParams(json.parameters, 'collection');

            this.handleInfo(json);

            this.setBasePath(json);

            this.handlePaths(json);

            this.addFoldersToCollection();

            this.collectionJson.id = this.collectionId;

            this.logger('Swagger converted successfully');

            validationResult.collection = this.collectionJson;

            return validationResult;
        },

        // since travis doesnt support es6
        endsWith: function (str, suffix) {
            return str.indexOf(suffix, str.length - suffix.length) !== -1;
        },

        /**
         * Converts a params collection object into an arrow of param objects.
         * @param {*} params
         */
        paramsObjectToArray: function (params) {
            var key,
                result = [];
            for (key in params) {
                if (params.hasOwnProperty(key)) {
                    result.push(params[key]);
                }
            }
            return result;
        },

        /**
         * Merge the 2 objects; with the first object taking precedence on key-conflicts.
         * @param {*} obj1 the assertive object.
         * @param {*} obj2 the deferring object.
         */
        mergeObjectArrays: function (obj1, obj2) {
            var i,
                result = [],
                tracker = [];

            obj1 = obj1 || [];
            obj2 = obj2 || [];

            for (i = 0; i < obj1.length; i++) {
                result.push(obj1[i]);
                tracker.push(obj1[i].name);
            }

            for (i = 0; i < obj2.length; i++) {
                if (tracker.indexOf(obj2[i].name) === -1) {
                    result.push(obj2[i]);
                }
            }

            return result;
        },

        /**
         * Checks if the parameter is a JavaScript object
         * @param {*} value
         */
        isObject: function (value) {
            return value && typeof value === 'object' && value.constructor === Object;
        }
    });

module.exports = Swagger2Postman;
