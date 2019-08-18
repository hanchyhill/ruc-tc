
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
    let time = dayjs.utc(line[2],'YYYYMMDDHH').format();
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

  let typeList = [];
  let sortList = [];
  for(let line of allRecords){
    let cType = line.type; // current type
    const doesInclude = typeList.includes(cType);
    if(doesInclude){
      let cItem = sortList.find(item=>item.oriType==cType);
      cItem.trackList.push(line);
    }else{
      sortList.push(
        {
          oriType: cType,
          trackList: [line],
        }
      );
      typeList.push(cType);
    }
  }
  
  sortList.forEach(v=>v.trackList = trimDuplicateTime(v.trackList));
  sortList.forEach(v=>v.type = setTcType(v.oriType,selectConfig(ins)));//
  sortList = sortList.filter(v=>{
    if(v.type===false){
      console.error('无法识别的类型');
      return false;
    }else{
      return true;
    }
  });// 去除无法识别的类型
  // console.log(sortList);
  sortList = trimDuplicateDetTrack(sortList);
  return sortList;
}

exports.resolveTCFA = transStr;