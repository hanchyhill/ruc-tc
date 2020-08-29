
const selectConfig = require('./insConfig.js').selectConfig;
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const customParseFormat = require('dayjs/plugin/customParseFormat');
dayjs.extend(utc);
dayjs.extend(customParseFormat);
function transLatLon(str='120N'){
  const numStr = str.slice(0,-1);
  const flag = str.slice(-1);
  const unsignedNum = Number(numStr)/10.0;
  const sign = flag.toUpperCase() =='N'||  flag.toUpperCase() =='E'? 1 : -1;
  return unsignedNum*sign;
}

function setTcType(oriType,config=selectConfig('ecmwf')) {
  let whichType = false;
  let cType = oriType;
  for (let iConfig of config.typeList){
    let matchType = iConfig.filter(cType);
    if(matchType){
      whichType = matchType;
      break;
    }else{
      continue;
    }
  }
  return whichType;
}

/**
 * 去除重复的时间
 * @param {Array} track 路径
 */
function trimDuplicateTime(trackList=[{step:0}]){
  let newTrack = [];
  let timeList = [];
  for(let line of trackList){
    let iTime = line.step;
    if(!timeList.includes(iTime)){
      newTrack.push(line);
      timeList.push(iTime);
    }else{
      continue;
    }
  }
  return newTrack;
}

function trimDuplicateDetTrack(list=[]){
  let newList = [];
  let isDetExist = false;
  for(let v of list){
    if(v.type.type==='determineForecast'){// 是否是确定性预报
      if(!isDetExist){// 还未检测到确定性预报
        isDetExist = true;
        newList.push(v);
      }else{
        continue;// 已经检测到确定性预报->跳过
      }
    }else{
      newList.push(v);
    }
  }
  return newList;
}

function transStr(str='',ins='ecmwf'){
  let lines = str.split('\n').filter(txt=>txt.includes(','));
  // console.log(lines);
  if(lines.length===0) return new Error('empety');
  let newLines = lines.
    map(line=>line.split(',')).
    map(line=>line.map(cell=>cell.trim()));

  let allRecords = newLines.map(line=>{
    let basinshort = line[0];
    let number = line[1];
    let time = dayjs.utc(line[2],'YYYYMMDDHH').toDate();
    let type = line[4];
    let step = Number(line[5]);
    let lat = transLatLon(line[6]);
    let lon = transLatLon(line[7]);
    let wind = Number(line[8])*0.5144;
    let pres = Number(line[9]);
    return {
      basinshort,
      number,
      time,
      step,
      type,
      lat,
      lon,
      wind,
      pres,
    }
  });

  let sortList = groupRecord(allRecords);
  sortList.forEach(tc=>tc.ins = ins);
  sortList.forEach(v=>v.trackList = trimDuplicateTime(v.trackList));
  sortList.forEach(v=>v.type = setTcType(v.oriType,selectConfig(ins)));//
  sortList = sortList.filter(v=>{
    if(v.type===false){
      console.error('无法识别的类型:');
      console.error(v);
      return false;
    }else{
      return true;
    }
  });// 去除无法识别的类型
  // console.log(sortList);
  // sortList = trimDuplicateDetTrack(sortList);
  return sortList;
  // return trans2mongoFormat(sortList);
}

/**
 * 转换为数据库所用格式
 * @param {Array} sortList 
 */
function trans2mongoFormat(sortList=[]){
  if(sortList.length===0){
    console.log('数据为空');
    return false;
  }
  let fc0 = sortList[0];// 第一个预报
  let newFormat = extractMetaInfo(fc0);
  // newFormat.controlIndex = 0;
  // newFormat.detTrack = {};
  let newTracks = sortList.map(fc=>{
    let track = fc.trackList.map(track=>[track.step,[track.lon,track.lat],track.pres,track.wind]);
    let fcType = fc.type.type;
    let ensembleNumber = fc.type.ensembleNumber;
    return {
      fcType,
      ensembleNumber,
      track,
    }
  });
  let detIndex = newTracks.findIndex(v=>v.fcType==='determineForecast');
  let controlIndex = newTracks.findIndex(v=>v.ensembleNumber===0);
  let ensembleTracks = newTracks;
  let detTrack = null;
  if(detIndex!==-1){
    detTrack = ensembleTracks.splice(detIndex,1);
  }
  newFormat.tracks = ensembleTracks;
  newFormat.controlIndex = controlIndex;
  newFormat.fillStatus = 0;
  if(detTrack) newFormat.detTrack = detTrack[0];
  if(ensembleTracks.length !== 0 &&detIndex !== -1) newFormat.fillStatus = 3;
  if(ensembleTracks.length == 0 &&detIndex !== -1) newFormat.fillStatus = 1;
  if(ensembleTracks.length !== 0 &&detIndex == -1) newFormat.fillStatus = 2;
  return newFormat;
}

function extractMetaInfo(fcItem={trackList:[{basinshort:''}],type:{},ins:''}){
  let tr0 = fcItem.trackList[0];
  let basinShort2 = tr0.basinshort;
  let cycloneNumber = tr0.number;
  let cycloneName = tr0.number+tr0.basinshort;
  let ins = fcItem.ins+'-R';
  let initTime = tr0.time;
  let tcID = `${dayjs.utc(initTime).format('YYYYMMDDHH')}_${cycloneName}_${cycloneNumber}_${ins}`;
  return {
    basinShort2,
    cycloneName,
    cycloneNumber,
    ins,
    initTime,
    tcID,
  }
  // let cycloneName = 
  //  "basinShort2" : "SP",
  // "cycloneNumber" : "15",
  // "cycloneName" : "Oma",
  // "ins" : "NCEP",
  // "initTime" : "2019-02-25T00:00:00.000Z",
}

/**
 * 分组 数据
 * @param {Array} allRecords 记录
 */
function groupRecord(allRecords=[]){
  let typeList = [];
  let sortList = [];
  let idList = [];
  // 分组
  for(let line of allRecords){
    
    let cType = line.type; // current type
    let tcID = line.basinshort + line.number;// current ID
    const doesIncludeType = typeList.includes(cType);
    const doesIncludeID = idList.includes(tcID);
    if(doesIncludeType&&doesIncludeID){// 同一个集合成员，同一个台风ID，则并入同一list中
      let cItem = sortList.find(item=>item.oriType==cType&&item.shortID==tcID);
      cItem.trackList.push(line);
    }else{
      sortList.push(
        {
          oriType: cType,
          shortID: tcID,
          trackList: [line],
        }
      );
      typeList.push(cType);
      idList.push(tcID);
    }
  }
  return sortList;
}

module.exports = {
  resolveTCFA: transStr,
  trans2mongoFormat,
};