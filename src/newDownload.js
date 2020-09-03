const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const toArray = require('dayjs/plugin/toArray');
const {resolveTCFA, trans2mongoFormat, trimDuplicateDetTrack} = require('./lib/newResolveTCFA.js');
const {pMakeDir,isExists,writeFile,myDebug} = require('./lib/util.js');
const got = require('got');
const {connect,initSchemas} = require('./db/initDB.js');
const schedule = require('node-schedule');
dayjs.extend(toArray);
const customParseFormat = require('dayjs/plugin/customParseFormat');
dayjs.extend(utc);
dayjs.extend(customParseFormat);

// TODO 判断文件是否存在
process.env.NODE_ENV = 'production';
// ######配置########
let modelConfig = {
  ncep:{
    ins:'ncep',
    model:'GEFS',
    detModel:'GFS',
    suffix:['ac00', ...generateRange(init=1, length=20, padding=2, prefix='ap')],
    timeInterval: 6,// 逐6小时
    ensNumber:21,
  },
  ecmwf:{
    ins:'ecmwf',
    model:'EPS',
    detModel:'IFS',
    suffix:['ec00', ...generateRange(init=1, length=25, padding=2, prefix='en'), 
                    ...generateRange(init=1, length=25, padding=2, prefix='ep')],
    timeInterval: 12,// 逐6小时
    ensNumber:51,
  },
  cmc:{
    ins:'cmc',
    model:'CENS',
    detModel:'CMC',
    suffix:['cmc','cc00', ...generateRange(init=1, length=20, padding=2, prefix='cp')],
    timeInterval: 12,// 逐6小时
    ensNumber:21,
  },
  ukmo:{
    ins:'ukmo',
    model:'MOGREPS-G',
    detModel:'UK',
    suffix:['uc00', ...generateRange(init=1, length=35, padding=2, prefix='uk')],
    timeInterval: 6,// 逐6小时
    ensNumber:36,
  },
  fnmoc:{
    ins:'fnmoc',
    model:'fnmoc',
    detModel:'fnmoc',
    suffix:['nc00', ...generateRange(init=1, length=19, padding=2, prefix='np')],
    timeInterval: 12,// 逐6小时
    ensNumber:20,
  },
}

let stausConfig = {};

let save2DB;
// ##############

/**
 * 根据当前时间判断需要下载哪个时次的文件
 * @param {Object} config 模式配置文件
 */
function which2Download(config={timeInterval:12, ins:'', suffix:[]}){
  const currentTimeUTC = dayjs.utc();
  const currentHour = currentTimeUTC.hour();
  const index = Number.parseInt((currentHour-2)/6);
  let timeList = [index, index-1, index-2,index-3].map(i=>currentTimeUTC.hour(i*6));
  timeList = timeList.filter(v=>v.hour()%config.timeInterval == 0);
  const formatTimeList = timeList.map(time=>time.format('YYYYMMDDHH'));
  
  console.log(formatTimeList);
  const multiTimeUrlList = formatTimeList.map(time=>create_ATCF_URL(time, suffixList=config.suffix));
  // downloadData(urlList[0]);
  return multiTimeUrlList;
}

/**
 * 生成ATCF文件路径列表
 * @param {String} timeString 时间戳
 * @param {Array} suffixList 模式代码列表
 */
function create_ATCF_URL(timeString='2020082900', suffixList=[]){
  const urlList = suffixList.map(suffix=>
    `https://ruc.noaa.gov/tracks/emc/${timeString}/trak.${suffix}.atcfunix.${timeString}`
  );
  return urlList;
}

/**
 * 整数补0
 * @param {Number} num 
 * @param {Number} length 整数长度
 */
function paddingInteger(num=0, length=2) {
  return (Array(length).join('0') + num).slice(-length);
}

/**
 * 生成数字等差列表
 * @param {Number} init 第一个元素起始数值
 * @param {Number} length 数组长度 
 * @param {Number} padding 数字位数
 * @param {String} prefix 前缀 
 * @param {String} suffix 后缀
 */
function generateRange(init=0, length = 10, padding = 2 , prefix, suffix){
  let range = new Array(length).fill(0).map((v,i)=>paddingInteger(i+init, padding));
  if(prefix) range = range.map(v=>prefix + v);
  if(suffix) range = range.map(v=>v + suffix);
  return range;
}

/**
 * 
 * @param {Object} pGot got实例
 */
async function downloadData(pGot){
  // console.log(url);
  if(!pGot) throw new TypeError('错误的参数pGot: ' + pGot);
  try{
    const response = await pGot;
    // console.log(response.body);
    // let tcbul = resolveTCFA(response.body, 'ncep');
    myDebug('已完成: ' + response.url);
    return {
      data: response.body,
      url: response.url,
    }
  }catch(err){
    if(err.response.statusCode === 404){ // 还没有数据，终止
      myDebug('File not Found 404: '+ err.response.url);
      err.message = 'File not Found 404: '+ err.response.url;
      err.error = true;
      err.errorCode = 404;
      throw err;
    }else if(pGot.isCanceled){
      myDebug('请求被取消'+pGot);
      return {
        error: true,
        errorCode: 404,
        isCanceled: true,
      }
    }
    else{
      throw err;
    }
  }
}

function mergeTCbyID(tcList=[]){
  let shortIDlist = tcList.flat().map(tc=>tc.shortID);
  let idSet = new Set(shortIDlist);
  let mergeList = [];
  for(let tcid of idSet){
    let filterTClist = tcList.flat().filter(tc=>tc.shortID===tcid);
    mergeList.push(filterTClist);
  }
  return mergeList;
}

async function write_TCFA_file(fileName, data){
  const filePath = path.resolve(__dirname, './../../data/cyclone/ruc/',fileName);
  const dirPath = path.dirname(filePath);
  await pMakeDir(dirPath);
  writeFile(filePath, data);
}

/**
 * 下载主函数
 * @param {String} model 机构/模式名称
 */
async function mainDownload(model='ncep'){
  myDebug(model);
  let iConfig = modelConfig[model];
  let multiTimeUrlList = which2Download(iConfig);
  // let selectedList = multiTimeUrlList[multiTimeUrlList.length - 1];
  // urlList = urlList.slice(0,2);
  for(let selectedList of multiTimeUrlList){
    let urlList = [];
    for(let url of selectedList){
      const matchStr = url.match(/\d{10}.*?$/);
      const filePath = path.resolve(__dirname, './../../data/cyclone/ruc/',matchStr[0]+'.txt');
      const isFileExists = await isExists(filePath);
      if(!isFileExists){
        urlList.push(url);
      }
    };
    
    if(urlList.length===0){
      myDebug('本地文件已存在无需下载');
      continue;
    }else{
      urlList = selectedList;// 不完整的需要全部重新下载
    }
    myDebug(urlList[0]);
    let rpList;
    let pGotList = urlList.map((url)=>got(url));
    try{
      // rpList = await Promise.all(urlList.map((url)=>downloadData(url)))
      rpList = await Promise.all(pGotList.map((pGot)=>downloadData(pGot)))
    }catch(err){
      if(err.errorCode === 404){
        myDebug('其中一个成员404，跳过本时次');
        pGotList.forEach(pGot => pGot.cancel())
        continue;
      }else{
        myDebug('链接异常');
        throw err;
      }
    }

    
    let tcList = [];
    for(let rp of rpList){
      if(rp.data){
        let recordList = resolveTCFA(rp.data, iConfig.ins);
        tcList.push(recordList);
        let url = rp.url;
        let matchStr = url.match(/\d{10}.*?$/);
        write_TCFA_file(matchStr[0]+'.txt', rp.data)
          .catch(err=>{console.trace(err)});
      }
    }
    if(tcList.length===0){
      console.log('数据为空');
      continue;
    }
    let arrangeTC = mergeTCbyID(tcList);
    let mgTClist = [];
    for(let tc of arrangeTC){
      tc = trimDuplicateDetTrack(tc);
      const mgTC = trans2mongoFormat(tc);
      mgTClist.push(mgTC);
      const tcID = mgTC.tcID;
      const matchTimeStr = tcID.match(/\d{10}/);
      if(matchTimeStr){
        const filePath = `./${matchTimeStr[0]}/${tcID}.json`;
        write_TCFA_file(filePath, JSON.stringify(mgTC,null,2))
          .catch(err=>{
            console.trace(err)
          });
      }
      save2DB(mgTC).catch(err=>{throw err});
    };
  }

  // return mgTClist;
}

/**
 * 多个机构下载
 */
async function mutiDownload(){
  const modelList = ['ncep','cmc','ecmwf','fnmoc','ukmo'];
  for(let model of modelList){
    await mainDownload(model)
      .catch(err=>{throw err});
  }
}

async function initDB(){
  await connect();
  initSchemas();
  save2DB = require('./db/util.db').save2DB;

  let ruleI1 = new schedule.RecurrenceRule();
  ruleI1.minute = [new schedule.Range(1, 59, 20)];// 20分钟轮询
  let job1 = schedule.scheduleJob(ruleI1, (fireDate)=>{
    // TODO 检测是否连接上mongodb
    console.log('轮询开始'+fireDate.toString());
    mutiDownload()
      .then(()=>{
        console.log('轮询完毕');
      })
      .catch(err=>{
        console.trace(err);
      });
  });
  return mutiDownload()
    .catch(err=>{
      console.trace(err);
    });
}

initDB().catch(err=>{
  console.trace(err);
})