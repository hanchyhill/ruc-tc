const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const toArray = require('dayjs/plugin/toArray');
const {resolveTCFA, trans2mongoFormat} = require('./lib/newResolveTCFA.js');
const {pMakeDir,isExists,writeFile,myDebug} = require('./lib/util.js');
const got = require('got');
// const {connect,initSchemas} = require('./db/initDB.js');
const schedule = require('node-schedule');
dayjs.extend(toArray);
const customParseFormat = require('dayjs/plugin/customParseFormat');
dayjs.extend(utc);
dayjs.extend(customParseFormat);

// TODO 判断文件是否存在

// ######配置########
let modelConfig = {
  ncep:{
    ins:'necp',
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
    suffix:['cc00', ...generateRange(init=1, length=20, padding=2, prefix='cp')],
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
// ##############

/**
 * 根据当前时间判断需要下载哪个时次的文件
 */
function which2Download(config){
  const currentTimeUTC = dayjs.utc();
  const currentHour = currentTimeUTC.hour();
  const index = Number.parseInt((currentHour-2)/6);
  let timeList = [index, index-1, index-2,index-3].map(i=>currentTimeUTC.hour(i*6));
  timeList = timeList.filter(v=>v.hour()%config.timeInterval == 0);
  const formatTimeList = timeList.map(time=>time.format('YYYYMMDDHH'));
  
  // TODO filter被6整除和12整除
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

function generateRange(init=0, length = 10, padding = 2 , prefix, suffix){
  let range = new Array(length).fill(0).map((v,i)=>paddingInteger(i+init, padding));
  if(prefix) range = range.map(v=>prefix + v);
  if(suffix) range = range.map(v=>v + suffix);
  return range;
}

async function downloadData(url=''){
  // console.log(url);
  try{
    const response = await got(url);
    // console.log(response.body);
    // let tcbul = resolveTCFA(response.body, 'ncep');
    // console.log(tcbul);
    return {
      data: response.body,
      url:url,
    }
  }catch(err){
    if(err.response.statusCode === 404){
      console.log('数据还未到达'+url);
      return {
        error: true,
        errorCode: 404,
      }
    } // 还没有数据，终止
    else{
      throw err;
    }
  }
}

async function mainDownload(){
  let iConfig = modelConfig.cmc;
  let multiTimeUrlList = which2Download(iConfig);
  let urlList = multiTimeUrlList[multiTimeUrlList.length - 1];
  myDebug(urlList);
  // TODO find exist file;
  let rpList = await Promise.all(urlList.map((url)=>downloadData(url)))
    .catch(err=>{
      throw err;
    });
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
    return;
  }
  let arrangeTC = mergeTCbyID(tcList);
  let mgTClist = [];
  for(let tc of arrangeTC){
    const mgTC = trans2mongoFormat(tc);
    mgTClist.push(mgTC);
    const tcID = mgTC.tcID;
    const matchTimeStr = tcID.match(/\d{10}/);
    if(matchTimeStr){
      const filePath = `./${matchTimeStr[0]}/${tcID}.json`;
      write_TCFA_file(filePath, JSON.stringify(mgTClist,null,2))
        .catch(err=>{
          console.trace(err)
        });
    }
  };
  return mgTClist;
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

mainDownload().catch(err=>{
  console.trace(err);
})