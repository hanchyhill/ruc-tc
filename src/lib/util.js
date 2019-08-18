const fs = require('fs');
const path = require('path');
const {promisify} = require('util');


/**
 * 递归创建目录
 * @param {string} dirname - 路径名
 * @param {function} callback - 回调函数
 */
function mkdirsCall(dirname, callback) {
  fs.exists(dirname, function (exists) {  
    if (exists) {
      callback();
    } else {  
      // console.log(path.dirname(dirname));  
      mkdirsCall(path.dirname(dirname), function () {  
          fs.mkdir(dirname, callback);  
          console.log('在' + path.dirname(dirname) + '目录创建好' + dirname  +'目录');
      });  
    }
  });
}

/**
 * 递归创建目录
 * @param {string} dirname - 路径名
 */
const pMakeDir = (dirname)=>{
  return new Promise((resolve,reject)=>{
    mkdirsCall(dirname,(err)=>err instanceof Error?reject(err):resolve('success'));
  });
}

/**
 * 判断文件是否存在
 * @param {string} dirname - 路径名
 * @param {function} callback - 回调函数
 */
const isExists = (path='')=>{
  return new Promise((resolve,reject)=>{
    fs.exists(path,(isExists)=>{
      resolve(isExists);
    })
  });
}

const myLogger = {
  debug(message, isError){
    console.log(message);
    let status = {};
    if(isError){
      status = new Error(message);
      status.isError = true;
      return status;
    }else{
      status.message = message;
      return status;
    }
  },
  note(notes, file, message){
    let info = `${notes?'['+notes+']':''}${file}:${message}`;
    console.log(info);
    return info;
  },
  bug(message){
    console.log(message);
    return new Error(message);
  },
  log(message){
    console.log(message);
    return message;
  }
}

/**
 * 测试环境console.log
 * @param {String} message 提示消息
 * @param {Object} isError 错误对象
 */
function myDebug(message, isError){
  if (process.env.NODE_ENV === 'production') {
    // just for production code
  }else{
    console.log(message);
  }
  
  let status = {};
  if(isError){
    status = new Error(message);
    status.isError = true;
    return status;
  }else{
    status.message = message;
    return status;
  }
}

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);

module.exports = {
  myLogger, myDebug, pMakeDir,isExists,writeFile,readFile
};