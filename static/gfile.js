function bind(scope, fn) {
    return function () {
        fn.apply(scope, arguments);
    };
}

function GDFileSystem(success) {
    this.deferred = $.Deferred();
    //this.success = success;
    //this.CLIENT_ID = '924397246859.apps.googleusercontent.com'; //BitMachine
    //this.CLIENT_ID = '551793820244.apps.googleusercontent.com'; //BitEdit
    this.CLIENT_ID =  _GLOBAL_CLIENT_ID;
    
    this.SCOPES = 'https://www.googleapis.com/auth/drive';
    
    gapi.auth.authorize({'client_id': this.CLIENT_ID, 'scope': this.SCOPES, 'immediate': true}, bind(this, this.HandleAuthResult));
    return this.deferred.promise();
}

GDFileSystem.prototype.HandleAuthResult = function(authResult) {
    if (authResult.error == undefined) {
         gapi.client.load('drive', 'v2',  bind(this, function() { this.deferred.resolveWith(this);}));      
    } else {
         // No access token could be retrieved, force the authorization flow.
         gapi.auth.authorize({'client_id': this.CLIENT_ID, 'scope': this.SCOPES, 'immediate': false},  bind(this, this.HandleAuthResult));
    }
};

GDFileSystem.prototype.GetObjectFromFilename = function (parent, path) {
    var deferred = $.Deferred();

    var folderId = parent;
    var query = "'"+folderId+"' in parents and title = '" + path + "' and trashed = false";        
    var retrievePageOfChildren = function(request, result) {
          request.execute(function(resp) {
            result = result.concat(resp.items);
            var nextPageToken = resp.nextPageToken;
            if (nextPageToken) {
              request = gapi.client.drive.children.list({
                'folderId' : folderId,
                'q': query,
                'pageToken': nextPageToken
              });
              retrievePageOfChildren(request, result);
            } else {
                if (result.length == 1 && result[0] !== undefined) {
                    deferred.resolve(result[0]);
                } else {
                    deferred.reject();
                }
            }
          });
        };
        var initialRequest = gapi.client.drive.children.list({
            'folderId' : folderId,
            'q': query,
          });
        retrievePageOfChildren(initialRequest, []);

    return deferred.promise();
};


GDFileSystem.prototype.CheckPath = function(path) {
    if (path[0] != "/") {
        throw "GDFS: must specify an absolute path";
    } else {
        return path.slice(1);
    }
};

GDFileSystem.prototype.GetLeafFromFilename = function (path) { 
    var _this = this;   
    var deferred = $.Deferred();
    path = this.CheckPath(path);

    var getLeafFromFilename = function (parent, path, obj) { 
        var pathParts = path.split("/");
        

        if (pathParts[0] !== "") {
            _this.GetObjectFromFilename(parent, pathParts[0]).done(function(r) {                            
                    getLeafFromFilename(r.id, pathParts.slice(1).join("/"), r);            
                }).fail(function() {
                    deferred.reject();
                });
        } else {
            deferred.resolve(obj);
        }
    };

    getLeafFromFilename("root", path);

    return deferred.promise();
};

GDFileSystem.prototype.Get = function (id) {
    var deferred = $.Deferred();

    /*    var request = gapi.client.drive.files.get({
       'fileId': id
     });
     request.execute(function(resp) {
        deferred.resolve(resp);
	});*/

	var request = gapi.client.request({
		'path': '/drive/v2/files/'+id,
		'method': 'GET',
	    });
	request.execute(function(resp) {
		deferred.resolve(resp);
	    });

     return deferred.promise();
};

GDFileSystem.prototype.List = function (id) {
    var deferred = $.Deferred();

    var query = "'"+id+"' in parents and trashed = false";    
    var retrievePageOfFiles = function(request, result) {
      request.execute(function(resp) {
        result = result.concat(resp.items);
        var nextPageToken = resp.nextPageToken;
        if (nextPageToken) {
          request = gapi.client.drive.files.list({
            'q': query,
            'pageToken': nextPageToken                
          });
          retrievePageOfFiles(request, result);
        } else {
          deferred.resolve(result);
        }
      });
    };
    var initialRequest = gapi.client.drive.files.list( {
      'q': query
    });
    retrievePageOfFiles(initialRequest, []);   
    
    return deferred.promise();    
};     

GDFileSystem.prototype.Download = function(file, downloadAsText, callback) {
  if (file.downloadUrl) {
    var accessToken = gapi.auth.getToken().access_token;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', file.downloadUrl);
    xhr.responseType = "blob";
    xhr.setRequestHeader('Authorization', 'Bearer ' + accessToken);
    xhr.onload = function() {
        var reader = new FileReader();
        reader.onload = function (e) {            
            callback(e.target.result);           
        };
        if (downloadAsText) {
            reader.readAsText(xhr.response);
        } else {
            reader.readAsArrayBuffer(xhr.response);
        }
    };
    xhr.onerror = function() {
      callback(null);
    };
    xhr.send();
  } else {
    callback(null);
  }
};


GDFileSystem.prototype.UpdateFile = function(fileId, fileData) {
    var deferred = $.Deferred();
    var fileMetadata = {};
    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";

    //var reader = new FileReader();
    //reader.readAsBinaryString(fileData);
    //reader.onload = function(e) {
    var contentType = fileData.type || 'application/octet-stream';
    // Updating the metadata is optional and you can instead use the value from drive.files.get.
    //var base64Data = btoa(reader.result);
    var multipartRequestBody =
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(fileMetadata) +
        delimiter +
        'Content-Type: ' + contentType + '\r\n' +
        //'Content-Transfer-Encoding: base64\r\n' +
        '\r\n' +
        //base64Data +
        fileData + 
        close_delim;

    var request = gapi.client.request({
        'path': '/upload/drive/v2/files/' + fileId,
        'method': 'PUT',
        'params': {'uploadType': 'multipart', 'alt': 'json'},
        'headers': {
          'Content-Type': 'multipart/mixed; boundary="' + boundary + '"'
        },
        'body': multipartRequestBody});

    
    var callback = function(file) {
        if (file.error != undefined) {            
            deferred.rejectWith(this, [file.error.message]);
        } else {
            deferred.resolveWith(this, [file]);
        }
    };
    
    request.execute(callback);
 // }

    return deferred.promise();
};

GDFileSystem.prototype.save = function (path, data, success) {
   
};


GDFileSystem.prototype.list = function (id, callback) {    
   throw "GDFS list not implemented";
};

GDFileSystem.prototype.ls = function (path) { 
    var _this = this;    
       
    var list = function(id) {
        _this.List(id).done(function(results) { 
                results.forEach(function(f) {
                    console.log(f.title);
                });
            });
    };
    
    if (path == "/") {
        list('root');
    } else {
        this.GetLeafFromFilename(path).done(function(obj) { 
           list(obj.id);
        });
    }
};

GDFileSystem.prototype.rm = function (path) {
   
};

GDFileSystem.prototype.mkdir = function (path, success) {
    var _this = this;
    var createFolder = function(parent, folder) {                
        var data = {};
        data.title = folder;
        data.parents = [{"id": parent.id}];
        data.mimeType = "application/vnd.google-apps.folder";
        gapi.client.drive.files.insert({'resource': data}).execute(success);
    };
     
    path = this.CheckPath(path);

    var walk = function (parent, path, obj) { 
        var pathParts = path.split("/");        
        if (pathParts[0] !== "") {
            _this.GetObjectFromFilename(parent, pathParts[0]).done(function(r) {                            
                    walk(r.id, pathParts.slice(1).join("/"), r);            
                }).fail(function() {
                    createFolder(obj, pathParts[0]);
                });
        } else {
            success();
        }
    };

    walk("root", path);
};

GDFileSystem.prototype.read = function (path, success, error, text) {
    var _this = this;
    this.GetLeafFromFilename(path).done(function(obj) {
        _this.Get(obj.id).done(function(x) { 
            _this.Download(x, text, function(result) {                                   
               success(result);
            });
        });
    });
};

GDFileSystem.prototype.readId = function (id,  text) {
    var _this = this;    
    var deferred = new $.Deferred();

    _this.Get(id).done(function(x) { 
        _this.Download(x, text, function(result) {                                   
           deferred.resolveWith(this, [x, result]);
        });
    });    

    return deferred.promise();
};

GDFileSystem.prototype.saveId = function (id, data, text) {       
    return this.UpdateFile(id, data);    
};

GDFileSystem.prototype.onError = function (e) {
    console.log('GDFilesystem Error: ' + e.name);
};