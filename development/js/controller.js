var WechatBackupControllers = angular.module('WechatBackupControllers',[]);
WechatBackupControllers.controller('EntryController',function ($scope,$state) {
    $scope.page = "entry page";
    $scope.sqlFile = "/Users/shidanlifuhetian/All/Tdevelop/微信备份数据库/MM.sqlite";
    $scope.onFileChange = function (files) {
        console.log(files);
        $scope.sqlFile = files[0].path;
    };
    $scope.importSqliteFile = function (sqliteFilePath) {
        // 使用ui-router实现页面跳转
        $state.go('chatList',{sqliteFilePath:sqliteFilePath});
    }

});

// chatList.html页面的controller
WechatBackupControllers.controller('ChatListController',function ($scope,$state, $stateParams) {
    $scope.dbTables = [];
    $scope.totalTablesCount = -1;
    $scope.tableSelected = "";
    $scope.previewData = [];
    $scope.filePath = $stateParams.sqliteFilePath;


    // "构造函数"，页面载入的时候执行
    $scope.ChatListController = function () {
        console.log("constructor");
        // sqlite3相关文档：https://github.com/mapbox/node-sqlite3/wiki/API
        var sqlite3 = require('sqlite3');
        // 打开一个sqlite数据库
        var db = new sqlite3.Database($scope.filePath,sqlite3.OPEN_READONLY,function (error) {
            if (error){
                console.log("Database error:",error);
            }
        });

        // 查找数据库内的所有table，并逐个遍历
         db.each("select * from SQLITE_MASTER where type = 'table' and name like 'Chat/_%' ESCAPE '/' ;",function (error,row) {
             // 回调函数，没获取一个条目，执行一次，第二个参数为当前条目

             // 声明一个promise，将条目的name传入resolve
            let getRowName = new Promise(function (resolve,reject) {
                if(!error)
                {
                    //console.log("row name: ",row.name);
                    resolve(row.name);
                    // let sql = "select count(*) as count from "+ row.name;
                    // let r = db.get(sql,function (error,result) {
                    //     if(!error)
                    //         console.log("get:",result);
                    //     else
                    //         console.log("get error:",error);
                    // });
                    // console.log("row count: ",r);
                }else{
                    //console.log("row error:",error);
                    reject(error);
                }
            });
             // 声明一个带参数的promise，写法和getRowName略有不同
             var getCount = function (rowName) {
                 let promise = new Promise(function (resolve,reject) {
                     ///
                     let sql = "select count(*) as count from "+ rowName;
                     let r = db.get(sql,function (error,result) {
                         if(!error) {
                             //console.log("count:", result.count);
                             //将传入的rowName和结果的count数一并传出去
                             resolve([rowName,result.count]);
                         }
                         else {
                             console.log("count error:", error);
                             reject(error)
                         }
                     });
                     ///
                 });
                 return promise;
             };
             // 执行promise。
             // 先getRowName,然后每获取到一个rowName就传入到getCount函数内，接着一个.then().里面输出的就是rowName和count一一对应的数组
            getRowName
                .then(getCount)
                .then(function (result) {
                //

                    db.get("select count(*) as count,MesSvrID as serverID from "+result[0],function (error, row) {
                        //console.log(row);
                        if(!(row.count <= 10))
                        {
                            console.log("rowName:",result[0],"count:",result[1]);
                             $scope.dbTables.push(result);
                            // if($scope.dbTables.length == $scope.totalTablesCount){
                            //     console.log("scope apply1,tables count:",$scope.dbTables.length)
                            //     $scope.$apply();
                            // }
                        }
                        $scope.$apply();
                    });
            });
        },function (error,result) {
            if(!error){
                $scope.totalTablesCount = result;
                console.log("completed total tables Count:",result);
            }else{
                console.log("complete error:",error);
            }
        });
    };
    // 执行"构造函数"
    $scope.ChatListController();

    $scope.onFilesSelected = function(files) {
        console.log("files - " + files);
    };

    // 用户在左侧选择了具体table
    $scope.onChatTableSelected = function (tableName) {
        //alert(tableName);
        $scope.tableSelected = tableName;
        $scope.previewData = [];
        // sqlite3相关文档：https://github.com/mapbox/node-sqlite3/wiki/API
        var sqlite3 = require('sqlite3');
        // 打开一个sqlite数据库
        var db = new sqlite3.Database($scope.filePath,sqlite3.OPEN_READONLY,function (error) {
            if (error){
                console.log("Database error:",error);
            }
        });

        var sql = "SELECT * FROM "+$scope.tableSelected+" order by CreateTime desc limit 10";
        db.all(sql, function(err, rows) {
            for(var i in rows){
                var time = formatTimeStamp(rows[i].CreateTime)
                //console.log(time);

                $scope.previewData.push({
                    time:time,
                    message:rows[i].Message
                })
            }
            //console.log("scope apply,previewData count:",$scope.previewData.length)

            $scope.$apply();

        });
    };

    $scope.exportChat = function (tableName) {
        $state.go('chatDetail',{tableName:tableName,sqliteFilePath:$stateParams.sqliteFilePath});
    }
});
// chatDetail.html页面的controller
WechatBackupControllers.controller('ChatDetailController',function ($scope, $state, $stateParams) {

    $scope.tableName = $stateParams.tableName;
    $scope.filePath = $stateParams.sqliteFilePath; //sqlite 文件路径
    $scope.folderPath = "";// 备份根路径，精确到md5
    $scope.imgFolderPath = "";// 图像路径
    $scope.meMd5 = "";// 我的
    $scope.chatterMd5 = "";// 聊天者的Md5值
    $scope.chatData = [];
    $scope.scrollToBottom = -1;
    $scope.count = 0;
    $scope.db = {};
    $scope.limitStart = 0;
    $scope.limitGap = 10;// 每次加载10条消息

    // 加载聊天记录
    $scope.loadMore = function () {
        var sql = "SELECT * FROM "+$scope.tableName+" order by CreateTime limit "+$scope.limitStart+","+$scope.limitGap;
        $scope.db.all(sql, function(err, rows) {
            for (var i in rows){
                var message = {
                    owner:rows[i].Des,
                    content:""
                };

                switch(rows[i].Type)
                {
                    case 1:// 文字消息
                        message.content = templateMessage(rows[i]);
                        break;
                    case 3:// 图片消息
                        message.content = $scope.templateImage(rows[i]);
                        break;
                    case 34:// 语音消息
                        message.content = "[语音消息]";
                    default:
                        message.content = "type id:"+rows[i].Type;
                }
                $scope.chatData.push(message);
            }
            //$scope.chatData = rows;
            //console.log("scope apply,chatData:",$scope.chatData);
            $scope.$apply();
            $scope.limitStart += $scope.limitGap;
        });
    };
    // 构造函数
    $scope.ChatDetailController = function () {
        //console.log("enter ChatDetailController");
        // /Users/shidanlifuhetian/All/Tdevelop/微信备份数据库/微信2017年01月07日备份/Documents/4ff9910cd14885aa373c45c4b7909ba7/DB/MM.sqlite

        $scope.folderPath = getFolderPath($scope.filePath);
        //console.log($scope.folderPath);
        $scope.meMd5 = getMyMd5($scope.folderPath);
        $scope.chatterMd5 = getChatterMd5($scope.tableName);
        console.log($scope.meMd5);
        $scope.imgFolderPath = $scope.folderPath +"Img/"+$scope.chatterMd5;
        var sqlite3 = require('sqlite3');
        // 打开一个sqlite数据库
        var db = new sqlite3.Database($scope.filePath,sqlite3.OPEN_READONLY,function (error) {
            if (error){
                console.log("Database error:",error);
            }
        });
        $scope.db = db;
        $scope.loadMore();

    };
    $scope.ChatDetailController();
    $scope.inputChange = function () {
        console.log("input Change");
    };

    $scope.$watch('scrollToBottom',function (newValue,oldValue) {
        $scope.count++;
        console.log("angular detect scroll,count:",$scope.count);
        console.log("new:",newValue," old:",oldValue);
        //$scope.$apply();
    });


    $scope.$watch('myVar', function() {
        alert('hey, myVar has changed!');
    });

    $scope.buttonClicked = function() {
        $scope.myVar = 2; // This will trigger $watch expression to kick in
    };

    $scope.templateImage = function (row) {
        var fs = require("fs");
        fs.readFile($scope.imgFolderPath+"/"+row.MesLocalID+".jpg",function (error, data) {

        })
        var imgTag = "<img src='"+$scope.imgFolderPath+"/"+row.MesLocalID+".jpg"+"'></img>";
        return imgTag;
    }
});

// useful functions
function add0(m){return m<10?'0'+m:m }

function formatTimeStamp(timeStamp) {
    var time = new Date(timeStamp*1000);
    var y = time.getFullYear();
    var m = time.getMonth()+1;
    var d = time.getDate();
    var h = time.getHours();
    var mm = time.getMinutes();
    var s = time.getSeconds();
    return y+'-'+add0(m)+'-'+add0(d)+' '+add0(h)+':'+add0(mm)+':'+add0(s);
}

function templateMessage(row) {
    return row.Message;
}
// function templateImage(row) {
//     var a = "<img src=''></img>";
// }
// 获取目录路径,返回值包括斜线形如："/abc/bsd/to/"
function getFolderPath(sqliteFilePath) {
    console.log(sqliteFilePath);
    var sep = sqliteFilePath.split("/");
    sep.pop();
    sep.pop();
    var folderPath = sep.join("/");
    return folderPath+="/";
}
function getMyMd5(folderPath) {
    var sep = folderPath.split("/");
    sep.pop();
    return sep.pop();
}
function getChatterMd5(tableName) {
    var sep = tableName.split("_");
    return sep.pop();

}