
const fs = require('fs');
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

/**
 * 分割原始数据按风暴编号分组
 * @param {string} str 原始数据字符串
 * @returns {Array} 按风暴分组的数据数组
 */
function splitBul(str = '') {
  let lines = str.split('\n').filter(txt => txt.includes(','));
  // console.log(lines);
  if (lines.length === 0) return new Error('empety');
  let newLines = lines.
    map(line => line.split(',')).
    map(line => line.map(cell => cell.trim()));
  // Remove the line that deletes the time field - this was causing data mutation
  let stormList = [];
  let stormName = [];
  for (let line of newLines) {// 按编号归类不同气旋
    let name = line[1];
    let index = stormName.findIndex(v => v === name);
    if (index !== -1) {
      stormList[index].push(line);
    } else {//不存在的话
      stormList.push([line]);
      stormName.push(name);
    }
  }
  let allInfo = stormList.map(storm => {
    let line = storm[0];
    let basin = line[0];
    let stormName = line[1];
    return {
      basin,
      stormName,
      lines: storm,
    }
  })
  return allInfo;
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

/**
 * 去除重复确定性预报
 * @param {Array} list tc 列表
 */
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

  let allRecords = newLines.map((line, index)=>{
    let basinshort = line[0];
    let number = line[1];
    if(line[2].length !== 10){
      console.error('时间格式错误:');
      console.error(line);
      console.error(index);
      return false;
    }
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
  let ins = fcItem.ins;// +'-R';
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
      if(cItem){
        cItem.trackList.push(line);
      }else{
        // 如果没找到匹配项，创建新的条目
        sortList.push({
          oriType: cType,
          shortID: tcID,
          trackList: [line],
        });
        typeList.push(cType);
        idList.push(tcID);
      }
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

/**
 * 根据ID合并台风数据
 * @param {Array} tcList 台风列表
 * @returns {Array} 按ID分组的台风数据数组
 */
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

/**
 * 增强版TCFA处理函数，支持多风暴数据处理
 * @param {string} str 原始数据字符串
 * @param {string} ins 机构标识，默认为'ecmwf'
 * @returns {Array} 处理后的台风数据数组
 */
function resolveTCFAWithSplit(str='', ins='ecmwf'){
  // 1. 按风暴分割数据
  let allInfo = splitBul(str);

  if(allInfo instanceof Error || allInfo.length === 0) {
    console.error('数据分割失败或为空');
    return [];
  }

  let allTCData = [];

  // 2. 处理每个风暴的数据
  for(let storm of allInfo) {
    // 使用现有的transStr逻辑处理每个风暴的lines
    let stormLines = storm.lines.map(line => line.join(',')).join('\n');
    let tcList = transStr(stormLines, ins);

    if(tcList && tcList.length > 0) {
      // 3. 按ID合并同一风暴的不同预报
      let mergedTC = mergeTCbyID(tcList);

      // 4. 对每个合并后的TC组应用去重和格式转换
      for(let tcGroup of mergedTC) {
        let processedGroup = trimDuplicateDetTrack(tcGroup);
        allTCData.push(processedGroup);
      }
    }
  }

  return allTCData;
}

/**
 * Read FNV3 data file and remove header comments
 * @param {string} filePath FNV3 file path
 * @returns {string} Data content without header comments
 */
function removeHeaderComments(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  // Find "# BEGIN DATA" line and extract data from next line
  const beginDataIndex = lines.findIndex(line => line.trim() === '# BEGIN DATA');

  if (beginDataIndex === -1) {
    throw new Error('Could not find "# BEGIN DATA" marker, file format may be incorrect');
  }

  // Extract data section (skip "# BEGIN DATA" line)
  const dataLines = lines.slice(beginDataIndex + 1);

  // Filter out empty lines and comment lines
  const cleanLines = dataLines.filter(line => {
    const trimmed = line.trim();
    return trimmed && !trimmed.startsWith('#');
  });

  return cleanLines.join('\n');
}

/**
 * Process FNV3 data file (basic method)
 * @param {string} filePath FNV3 file path
 * @param {string} ins Institution identifier, default 'fnv3'
 * @returns {Object} Processed data result
 */
function processFNV3Data(filePath, ins = 'fnv3') {
  try {
    // 1. Read file and remove header comments
    const cleanData = removeHeaderComments(filePath);

    if (!cleanData.trim()) {
      console.error('No valid data content found in file');
      return null;
    }

    // 2. Use resolveTCFA to parse data
    const parsedData = transStr(cleanData, ins);

    if (!parsedData || parsedData.length === 0) {
      console.error('Data parsing failed or result is empty');
      return null;
    }

    // 3. Convert to MongoDB format
    const mongoFormats = [];
    for (const tcData of parsedData) {
      const mongoFormat = trans2mongoFormat([tcData]);
      if (mongoFormat) {
        mongoFormats.push(mongoFormat);
      }
    }

    return {
      method: 'basic',
      originalCount: parsedData.length,
      processedCount: mongoFormats.length,
      data: mongoFormats
    };

  } catch (error) {
    console.error('Error processing FNV3 data:', error.message);
    return null;
  }
}

/**
 * Process FNV3 data file with enhanced splitting and merging
 * @param {string} filePath FNV3 file path
 * @param {string} ins Institution identifier, default 'fnv3'
 * @returns {Object} Enhanced processed data result
 */
function processFNV3DataEnhanced(filePath, ins = 'fnv3') {
  try {
    // 1. Read file and remove header comments
    const cleanData = removeHeaderComments(filePath);

    if (!cleanData.trim()) {
      console.error('No valid data content found in file');
      return null;
    }

    // 2. Use enhanced processing with split and merge
    const processedGroups = resolveTCFAWithSplit(cleanData, ins);

    if (!processedGroups || processedGroups.length === 0) {
      console.error('Enhanced data processing failed or result is empty');
      return null;
    }

    // 3. Convert each group to MongoDB format
    const mongoFormats = [];
    let totalOriginalCount = 0;

    for (const tcGroup of processedGroups) {
      totalOriginalCount += tcGroup.length;
      const mongoFormat = trans2mongoFormat(tcGroup);
      if (mongoFormat) {
        mongoFormats.push(mongoFormat);
      }
    }

    return {
      method: 'enhanced',
      stormGroups: processedGroups.length,
      originalCount: totalOriginalCount,
      processedCount: mongoFormats.length,
      data: mongoFormats
    };

  } catch (error) {
    console.error('Error processing FNV3 data with enhanced method:', error.message);
    return null;
  }
}

/**
 * Main function for FNV3 processing - process specified FNV3 file
 */
function mainFNV3() {
  const filePath = 'H:\\github\\ty-locator\\resource\\FNV3_2025_09_27T18_00_atcf_a_deck.txt';

  console.log(`Starting to process FNV3 file: ${filePath}`);
  console.log('='.repeat(60));

  // Test basic processing method
  console.log('\n1. Basic Processing Method:');
  const basicResult = processFNV3Data(filePath);

  if (basicResult) {
    console.log(`✓ Basic processing completed:`);
    console.log(`  - Method: ${basicResult.method}`);
    console.log(`  - Original records: ${basicResult.originalCount}`);
    console.log(`  - Processed records: ${basicResult.processedCount}`);
    if (basicResult.data[0]) {
      console.log(`  - Sample data:`, JSON.stringify(basicResult.data[0], null, 2));
    }
  } else {
    console.log('✗ Basic processing failed');
  }

  console.log('\n' + '-'.repeat(60));

  // Test enhanced processing method
  console.log('\n2. Enhanced Processing Method (with split & merge):');
  const enhancedResult = processFNV3DataEnhanced(filePath);

  if (enhancedResult) {
    console.log(`✓ Enhanced processing completed:`);
    console.log(`  - Method: ${enhancedResult.method}`);
    console.log(`  - Storm groups: ${enhancedResult.stormGroups}`);
    console.log(`  - Original records: ${enhancedResult.originalCount}`);
    console.log(`  - Processed records: ${enhancedResult.processedCount}`);
    if (enhancedResult.data[0]) {
      console.log(`  - Sample data:`, JSON.stringify(enhancedResult.data[0], null, 2));
    }
  } else {
    console.log('✗ Enhanced processing failed');
  }

  console.log('\n' + '='.repeat(60));
  console.log('Processing comparison completed');
}

// Run FNV3 main function when script is executed directly
if (require.main === module) {
  mainFNV3();
}

module.exports = {
  resolveTCFA: transStr,
  trans2mongoFormat,
  trimDuplicateDetTrack,
  splitBul,
  mergeTCbyID,
  resolveTCFAWithSplit,
  removeHeaderComments,
  processFNV3Data,
  processFNV3DataEnhanced,
  mainFNV3,
};