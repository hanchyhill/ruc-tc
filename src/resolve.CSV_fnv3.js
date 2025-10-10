const fs = require('fs');
const path = require('path');
const {selectConfig} = require('./insConfig.js');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const customParseFormat = require('dayjs/plugin/customParseFormat');
dayjs.extend(utc);
dayjs.extend(customParseFormat);

const TIME_FORMAT = 'YYYY-MM-DD HH:mm:ss';
const WIND_KNOTS_TO_MS = 0.5144;

function setTcType(oriType, config = selectConfig('fnv3-gen')) {
  let whichType = false;
  let cType = oriType;
  for (let iConfig of config.typeList) {
    let matchType = iConfig.filter(cType);
    if (matchType) {
      whichType = matchType;
      break;
    } else {
      continue;
    }
  }
  return whichType;
}

function trimDuplicateTime(trackList = [{step: 0}]) {
  let newTrack = [];
  let timeList = [];
  for (let line of trackList) {
    let iTime = line.step;
    if (!timeList.includes(iTime)) {
      newTrack.push(line);
      timeList.push(iTime);
    } else {
      continue;
    }
  }
  return newTrack;
}

function trimDuplicateDetTrack(list = []) {
  let newList = [];
  let isDetExist = false;
  for (let v of list) {
    if (v.type.type === 'determineForecast') {
      if (!isDetExist) {
        isDetExist = true;
        newList.push(v);
      } else {
        continue;
      }
    } else {
      newList.push(v);
    }
  }
  return newList;
}

function groupRecord(allRecords = []) {
  let typeList = [];
  let sortList = [];
  let idList = [];
  for (let line of allRecords) {
    let cType = line.type;
    let tcID = line.basinshort + line.number;
    const doesIncludeType = typeList.includes(cType);
    const doesIncludeID = idList.includes(tcID);
    if (doesIncludeType && doesIncludeID) {
      // let cItem = sortList.find(item => item.oriType === cType && item.shortID === tcID);
      let cItem = sortList.find(item => item.oriType === cType &&item.trackId === line.trackId);
      if (cItem) {
        cItem.trackList.push(line);
      } else {
        sortList.push({
          oriType: cType,
          shortID: tcID,
          trackId: line.trackId,
          trackList: [line],
        });
        typeList.push(cType);
        idList.push(tcID);
      }
    } else {
      sortList.push({
        oriType: cType,
        shortID: tcID,
        trackId: line.trackId,
        trackList: [line],
      });
      typeList.push(cType);
      idList.push(tcID);
    }
  }
  return sortList;
}

function mergeTCbyID(tcList = []) {
  let shortIDlist = tcList.flat().map(tc => tc.shortID);
  let idSet = new Set(shortIDlist);
  let mergeList = [];
  for (let tcid of idSet) {
    let filterTClist = tcList.flat().filter(tc => tc.shortID === tcid);
    mergeList.push(filterTClist);
  }
  return mergeList;
}

function mergeTCbyTrackId(tcList = []) {
  let trackIdlist = tcList.flat().map(tc => tc.trackId);
  let idSet = new Set(trackIdlist);
  let mergeList = [];
  for (let trackId of idSet) {
    let filterTClist = tcList.flat().filter(tc => tc.trackId === trackId);
    mergeList.push(filterTClist);
  }
  return mergeList;
}

function extractMetaInfo(fcItem = {trackList: [{basinshort: ''}], type: {}, ins: ''}) {
  let tr0 = fcItem.trackList[0];
  let basinShort2 = tr0.basinshort;
  let cycloneNumber = tr0.number;
  let cycloneName = tr0.number + tr0.basinshort;
  let ins = fcItem.ins;
  let initTime = tr0.time;
  let tcID = `${dayjs.utc(initTime).format('YYYYMMDDHH')}_${cycloneName}_${cycloneNumber}_${ins}`;
  return {
    basinShort2,
    cycloneName,
    cycloneNumber,
    ins,
    initTime,
    tcID,
  };
}

function trans2mongoFormat(sortList = []) {
  if (sortList.length === 0) {
    console.log('数据为空');
    return false;
  }
  let fc0 = sortList[0];
  let newFormat = extractMetaInfo(fc0);
  let newTracks = sortList.map(fc => {
    let track = fc.trackList.map(track => [track.step, [track.lon, track.lat], track.pres, track.wind]);
    let fcType = fc.type.type;
    let ensembleNumber = fc.type.ensembleNumber;
    return {
      fcType,
      ensembleNumber,
      track,
    };
  });
  let detIndex = newTracks.findIndex(v => v.fcType === 'determineForecast');
  let controlIndex = newTracks.findIndex(v => v.ensembleNumber === 0);
  let ensembleTracks = newTracks;
  let detTrack = null;
  if (detIndex !== -1) {
    detTrack = ensembleTracks.splice(detIndex, 1);
  }
  newFormat.tracks = ensembleTracks;
  newFormat.controlIndex = controlIndex;
  newFormat.fillStatus = 0;
  if (detTrack) newFormat.detTrack = detTrack[0];
  if (ensembleTracks.length !== 0 && detIndex !== -1) newFormat.fillStatus = 3;
  if (ensembleTracks.length === 0 && detIndex !== -1) newFormat.fillStatus = 1;
  if (ensembleTracks.length !== 0 && detIndex === -1) newFormat.fillStatus = 2;
  return newFormat;
}

function parseCSVRows(str = '') {
  const lines = str.split(/\r?\n/);
  const dataLines = [];
  for (const rawLine of lines) {
    const line = rawLine.replace(/\r/g, '').trim();
    if (!line || line.startsWith('#')) continue;
    dataLines.push(line);
  }
  if (dataLines.length <= 1) {
    return [];
  }
  const header = dataLines[0].split(',').map(cell => cell.trim());
  const rows = [];
  for (let i = 1; i < dataLines.length; i++) {
    const raw = dataLines[i];
    const cells = raw.split(',');
    if (cells.length === 1 && cells[0].trim() === '') continue;
    const record = {};
    for (let j = 0; j < header.length; j++) {
      const cell = cells[j] !== undefined ? cells[j] : '';
      record[header[j]] = cell.trim();
    }
    rows.push(record);
  }
  return rows;
}

function getBasinshortByLonLat(lon, lat) {
  // 输入假定经度 lon 单位为度，范围 [-180, 180]，纬度 lat 范围 [-90, 90]
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
    return null;
  }
  
  // 对经度做 0–360 转换便于判断
  let lon360 = lon < 0 ? lon + 360 : lon;  // 把负经度变为 0–360 表示
  
  // 北半球判断（赤道及以上 lat >= 0）
  if (lat >= 0) {
    // 西北太平洋 WP：经度 100°E ~ 180°E
    if (lon360 >= 100 && lon360 <= 180) {
      return "WP";
    }
    // 东太平洋 EP：经度 180°W ~ 80°W → 在 lon360 表示上是 180~360 或 0~280
    // 实际 EP 区域经度范围是 140°W（= 220°E）到 80°W（= 280°E），对应 lon360 220~280
    if (lon360 >= 220 && lon360 <= 280) {
      return "EP";
    }
    // 中太平洋 CP：经度 180°W ~ 140°W → 在 lon360 表示上是 180~220
    if (lon360 > 180 && lon360 < 220) {
      return "CP";
    }
    // 北印度洋 IO：经度 40°E ~ 100°E → lon360 40~100
    if (lon360 >= 40 && lon360 <= 100) {
      return "IO";
    }
    // 北大西洋 AL：经度 100°W ~ 0° → lon360 260~360 或 0~0 （其实 100°W = 260°E 到 360/0°）
    if ((lon360 >= 260 && lon360 <= 360) || (lon360 >= 0 && lon360 <= 0)) {
      return "AL";
    }
    // 特殊：大西洋靠近 0°经线的点也在上面判断中被包含
  }
  
  // 南半球判断（lat < 0）
  if (lat < 0) {
    // 南大西洋 SL / LS：如果在南半球且经度在大西洋对应区间（100°W ~ 20°E，也就是 lon360 260~360 或 0~20）
    if ((lon360 >= 260 && lon360 <= 360) || (lon360 >= 0 && lon360 <= 20)) {
      return "SL";  // 用 SL 表示南大西洋
    }
    // 否则属于南半球其他洋区（南太平洋、南印度洋等），用 SH 统一标识
    return "SH";
  }
  
  // 如果都没命中，则返回 null
  return 'UNKNOWN';
}

function buildRecordFromCSV(item = {}, index = 0) {
  const trackId = (item.track_id || '').trim();
  let basinshort, number;
  if (!trackId) {
    console.warn(`记录 ${index + 1} 缺少 track_id 字段，已跳过`);
    return null;
  }
  if (trackId.length < 3) {
    basinshort = getBasinshortByLonLat(Number(item.lon), Number(item.lat));
    number = 'I-' + trackId.padStart(2, '0');
    // console.warn(`记录 ${index + 1} 的 track_id (${trackId}) 长度异常，已跳过`);
    // return null;
  }else{
    basinshort = trackId.slice(0, 2).toUpperCase();
    number = trackId.slice(2,4);
  }

  const initTimeStr = (item.init_time || '').trim();
  const validTimeStr = (item.valid_time || '').trim();
  const initTime = dayjs.utc(initTimeStr)//, TIME_FORMAT);
  const validTime = dayjs.utc(validTimeStr)//, TIME_FORMAT);

  if (!initTime.isValid() || !validTime.isValid()) {
    console.warn(`记录 ${index + 1} 的时间格式无效: init=${initTimeStr}, valid=${validTimeStr}`);
    return null;
  }

  const sampleValue = Number((item.sample || '').trim());
  if (!Number.isFinite(sampleValue)) {
    console.warn(`记录 ${index + 1} 的 sample 字段无效: ${item.sample}`);
    return null;
  }
  const ensembleNumber = Math.round(sampleValue);
  const typeKey = `FN${String(Math.max(ensembleNumber, 0)).padStart(2, '0')}`;

  const lat = Number(item.lat);
  const lon = Number(item.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    console.warn(`记录 ${index + 1} 的经纬度无效: lat=${item.lat}, lon=${item.lon}`);
    return null;
  }

  const windKnots = Number(item.maximum_sustained_wind_speed_knots);
  const presValue = Number(item.minimum_sea_level_pressure_hpa);

  return {
    basinshort,
    number,
    time: initTime.toDate(),
    step: validTime.diff(initTime, 'hour'),
    type: typeKey,
    lat,
    lon,
    wind: Number.isFinite(windKnots) ? windKnots * WIND_KNOTS_TO_MS : NaN,
    pres: Number.isFinite(presValue) ? presValue : NaN,
    trackId,
  };
}

function convertCSVRowsToForecasts(rows = [], ins = 'fnv3-gen') {
  if (!rows.length) return [];
  const allRecords = [];
  for (let i = 0; i < rows.length; i++) {
    const record = buildRecordFromCSV(rows[i], i);
    if (record) {
      allRecords.push(record);
    }
  }
  if (!allRecords.length) return [];
  let sortList = groupRecord(allRecords);
  const config = selectConfig(ins);
  for (let tc of sortList) {
    tc.ins = ins;
    tc.trackList.sort((a, b) => a.step - b.step);
    tc.trackList = trimDuplicateTime(tc.trackList);
    tc.type = setTcType(tc.oriType, config);
  }
  sortList = sortList.filter(v => {
    if (v.type === false) {
      console.error('无法识别的类型:', v.oriType);
      return false;
    } else {
      return true;
    }
  });
  return sortList;
}

function resolveCSV(str = '', ins = 'fnv3-gen') {
  const rows = parseCSVRows(str);
  if (!rows.length) return [];
  return convertCSVRowsToForecasts(rows, ins);
}

function splitRowsByTrack(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    const trackId = (row.track_id || 'UNKNOWN').trim();
    if (!groups.has(trackId)) {
      groups.set(trackId, []);
    }
    groups.get(trackId).push(row);
  }
  return Array.from(groups.values());
}

function resolveCSVWithSplit(str = '', ins = 'fnv3-gen') {
  const rows = parseCSVRows(str);
  if (!rows.length) return [];
  const groupedRows = splitRowsByTrack(rows);
  const allTCData = [];
  for (const group of groupedRows) {
    const tcList = convertCSVRowsToForecasts(group, ins);
    if (tcList && tcList.length > 0) {
      const mergedTC = mergeTCbyID(tcList);
      // const mergedTC = mergeTCbyTrackId(tcList);
      for (const tcGroup of mergedTC) {
        const processedGroup = trimDuplicateDetTrack(tcGroup);
        allTCData.push(processedGroup);
      }
    }
  }
  return allTCData;
}

function removeHeaderComments(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const beginDataIndex = lines.findIndex(line => line.trim() === '# BEGIN DATA');
  if (beginDataIndex === -1) {
    throw new Error('Could not find "# BEGIN DATA" marker, file format may be incorrect');
  }
  const dataLines = lines.slice(beginDataIndex + 1);
  const cleanLines = dataLines.filter(line => {
    const trimmed = line.trim();
    return trimmed && !trimmed.startsWith('#');
  });
  return cleanLines.join('\n');
}

function processFNV3CSVData(filePath, ins = 'fnv3-gen') {
  try {
    const cleanData = removeHeaderComments(filePath);
    if (!cleanData.trim()) {
      console.error('No valid data content found in file');
      return null;
    }
    const parsedData = resolveCSV(cleanData, ins);
    if (!parsedData || parsedData.length === 0) {
      console.error('Data parsing failed or result is empty');
      return null;
    }
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
      data: mongoFormats,
    };
  } catch (error) {
    console.error('Error processing FNV3 CSV data:', error.message);
    return null;
  }
}

function processFNV3CSVDataEnhanced(filePath, ins = 'fnv3-gen') {
  try {
    const cleanData = removeHeaderComments(filePath);
    if (!cleanData.trim()) {
      console.error('No valid data content found in file');
      return null;
    }
    const processedGroups = resolveCSVWithSplit(cleanData, ins);
    if (!processedGroups || processedGroups.length === 0) {
      console.error('Enhanced data processing failed or result is empty');
      return null;
    }
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
      data: mongoFormats,
    };
  } catch (error) {
    console.error('Error processing FNV3 CSV data with enhanced method:', error.message);
    return null;
  }
}

function mainFNV3CSV() {
  // const filePath = path.resolve(__dirname, '../demo/FNV3_2025_09_27T18_00_paired.csv');
  const filePath = path.resolve(__dirname, '../demo/FNV3_2025_09_27T18_00_cyclogenesis.csv');
  
  console.log(`Starting to process FNV3 CSV file: ${filePath}`);
  console.log('='.repeat(60));

  console.log('\n1. Basic Processing Method:');
  const basicResult = processFNV3CSVData(filePath);
  if (basicResult) {
    console.log(`OK Basic processing completed:`);
    console.log(`  - Method: ${basicResult.method}`);
    console.log(`  - Original records: ${basicResult.originalCount}`);
    console.log(`  - Processed records: ${basicResult.processedCount}`);
    if (basicResult.data[0]) {
      console.log(`  - Sample data:`, JSON.stringify(basicResult.data[0], null, 2));
    }
  } else {
    console.log('FAIL Basic processing failed');
  }
  // 导出 enhancedResult 为 JSON 文件
  if (basicResult && basicResult.data) {
    const outputPath = path.resolve(__dirname, '../demo/fnv3_basic_result.json');
    try {
      fs.writeFileSync(outputPath, JSON.stringify(basicResult, null, 2), 'utf8');
      console.log(`Basic result exported to: ${outputPath}`);
    } catch (writeError) {
      console.error('Failed to export basic result:', writeError.message);
    }
  }

  console.log('\n' + '-'.repeat(60));

  console.log('\n2. Enhanced Processing Method (with split & merge):');
  let enhancedResult = processFNV3CSVDataEnhanced(filePath);
  // enhancedResult.data = enhancedResult.data.filter(v => v.basinShort2 === 'WP');
  // 导出 enhancedResult 为 JSON 文件
  if (enhancedResult && enhancedResult.data) {
    const outputPath = path.resolve(__dirname, '../demo/fnv3_enhanced_result.json');
    try {
      fs.writeFileSync(outputPath, JSON.stringify(enhancedResult, null, 2), 'utf8');
      console.log(`Enhanced result exported to: ${outputPath}`);
    } catch (writeError) {
      console.error('Failed to export enhanced result:', writeError.message);
    }
  }
  if (enhancedResult) {
    console.log(`OK Enhanced processing completed:`);
    console.log(`  - Method: ${enhancedResult.method}`);
    console.log(`  - Storm groups: ${enhancedResult.stormGroups}`);
    console.log(`  - Original records: ${enhancedResult.originalCount}`);
    console.log(`  - Processed records: ${enhancedResult.processedCount}`);
    if (enhancedResult.data[0]) {
      console.log(`  - Sample data:`, JSON.stringify(enhancedResult.data[0], null, 2));
    }
  } else {
    console.log('FAIL Enhanced processing failed');
  }

  console.log('\n' + '='.repeat(60));
  console.log('CSV Processing comparison completed');
}

if (require.main === module) {
  mainFNV3CSV();
}

module.exports = {
  resolveCSV,
  trans2mongoFormat,
  trimDuplicateDetTrack,
  mergeTCbyID,
  mergeTCbyTrackId,
  resolveCSVWithSplit,
  removeHeaderComments,
  processFNV3CSVData,
  processFNV3CSVDataEnhanced,
  mainFNV3CSV,
};
