const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const customParseFormat = require('dayjs/plugin/customParseFormat');
dayjs.extend(utc);
dayjs.extend(customParseFormat);

let ecConfig = {
  typeList : [
    {
      type:"ensembleForecast",
      filter(str='EM01'){
        const reg =  /.*?(\d{2})/;
        const result = str.match(reg);// Array ["EM01", "01"]
        if(result){
          return {
            type:"ensembleForecast",
            ensembleNumber: Number(result[1]),
            oriType:str,
          }
        }else{
          return false;
        }
      },
    },
    {
      type:'determineForecast',
      filter(str='EMDT'){
        if(str=='EMDT'||str=='ECMO'||str=='ECMF'){
          return {
            type:"determineForecast",
            ensembleNumber: -1,
            oriType:str,
          }
        }else{
          return false;
        }
      }
    },
    
  ],
}

function setTcType(oriType,config=ecConfig) {
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
// console.log(dayjs.utc())
let str =
`WP, 02, 2019022500, 83, EM01,   0, 135N, 1402E,  80,  965,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM01,   0, 135N, 1402E,  80,  965,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM01,  12, 145N, 1403E,  70,  972,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM01,  24, 153N, 1403E,  72,  968,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM01,  36, 162N, 1409E,  67,  973,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM01,  48, 165N, 1407E,  50,  992,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM01,  60, 165N, 1397E,  39,  995,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM02,   0, 135N, 1402E,  97,  959,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM02,  12, 145N, 1397E,  68,  975,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM02,  24, 151N, 1394E,  60,  983,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM02,  36, 152N, 1386E,  41,  995,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM02,  48, 153N, 1371E,  41, 1001,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM03,   0, 144N, 1409E,  60,  983,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM03,  12, 152N, 1403E,  54,  985,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM03,  24, 155N, 1395E,  46,  994,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM03,  36, 160N, 1389E,  39,  998,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM04,   0, 135N, 1402E, 152,  941,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM04,  12, 139N, 1392E,  73,  963,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM04,  24, 149N, 1393E,  77,  962,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM04,  36, 156N, 1399E,  78,  968,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM04,  48, 160N, 1399E,  53,  986,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM04,  60, 162N, 1385E,  45,  996,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM05,   0, 135N, 1402E,  89,  959,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM05,  12, 145N, 1399E,  73,  970,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM05,  24, 152N, 1399E,  75,  967,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM05,  36, 158N, 1402E,  69,  976,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM05,  48, 155N, 1393E,  44,  993,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM05,  60, 153N, 1373E,  46,  999,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM05,  72, 158N, 1346E,  36, 1001,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM05,  84, 165N, 1327E,  32, 1003,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM05,  96, 174N, 1314E,  35, 1003,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM05, 108, 175N, 1298E,  35, 1005,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM06,   0, 135N, 1402E,  75,  965,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM06,  12, 146N, 1400E,  68,  977,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM06,  24, 155N, 1400E,  66,  981,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM06,  36, 162N, 1402E,  56,  990,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM06,  48, 163N, 1392E,  34,  999,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM07,   0, 135N, 1402E,  92,  958,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM07,  12, 142N, 1397E,  68,  974,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM07,  24, 151N, 1399E,  71,  971,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM07,  36, 155N, 1402E,  69,  973,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM07,  48, 155N, 1393E,  52,  989,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM07,  60, 148N, 1371E,  41,  999,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM07,  72, 150N, 1344E,  36, 1000,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM07,  84, 154N, 1320E,  29, 1003,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM07,  96, 155N, 1299E,  28, 1008,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM08,   0, 135N, 1402E,  74,  966,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM08,  12, 148N, 1400E,  72,  973,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM08,  24, 156N, 1396E,  53,  983,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM08,  36, 163N, 1390E,  53,  992,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM08,  48, 166N, 1380E,  38, 1000,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM09,   0, 135N, 1400E, 101,  959,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM09,  12, 144N, 1395E,  64,  979,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM09,  24, 152N, 1392E,  53,  985,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM09,  36, 155N, 1383E,  48,  993,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM09,  48, 155N, 1368E,  36, 1000,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM09,  60, 158N, 1352E,  34, 1003,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM10,   0, 137N, 1403E,  81,  963,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM10,  12, 146N, 1403E,  71,  971,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM10,  24, 152N, 1402E,  71,  969,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM10,  36, 158N, 1403E,  55,  986,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM10,  48, 156N, 1392E,  40,  997,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM10,  60, 159N, 1379E,  38, 1001,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM11,   0, 135N, 1402E,  88,  957,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM11,  12, 146N, 1399E,  71,  973,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM11,  24, 155N, 1402E,  67,  974,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM11,  36, 160N, 1404E,  55,  988,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM11,  48, 160N, 1393E,  40,  998,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM12,   0, 135N, 1402E,  66,  967,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM12,  12, 144N, 1399E,  64,  973,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM12,  24, 149N, 1395E,  69,  976,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM12,  36, 152N, 1390E,  56,  987,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM12,  48, 149N, 1376E,  42,  998,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM12,  60, 146N, 1358E,  39, 1002,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM13,   0, 135N, 1402E,  87,  958,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM13,  12, 145N, 1397E,  70,  970,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM13,  24, 152N, 1400E,  70,  970,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM13,  36, 159N, 1406E,  73,  973,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM13,  48, 158N, 1397E,  45,  993,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM13,  60, 156N, 1379E,  37, 1001,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM14,   0, 135N, 1402E,  70,  966,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM14,  12, 145N, 1400E,  64,  979,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM14,  24, 152N, 1399E,  59,  982,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM14,  36, 158N, 1390E,  47,  991,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM14,  48, 160N, 1376E,  41,  998,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM15,   0, 135N, 1402E,  84,  964,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM15,  12, 142N, 1399E,  64,  972,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM15,  24, 152N, 1400E,  71,  969,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM15,  36, 158N, 1399E,  65,  977,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM15,  48, 156N, 1387E,  42,  995,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM15,  60, 155N, 1369E,  36, 1000,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM15,  72, 162N, 1345E,  31, 1002,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM16,   0, 135N, 1402E,  79,  960,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM16,  12, 146N, 1403E,  69,  972,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM16,  24, 153N, 1400E,  62,  983,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM16,  36, 156N, 1393E,  35,  997,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM16,  48, 160N, 1384E,  33,  999,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM16,  60, 162N, 1372E,  37, 1004,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM17,   0, 135N, 1402E,  83,  958,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM17,  12, 146N, 1399E,  72,  970,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM17,  24, 156N, 1402E,  76,  968,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM17,  36, 163N, 1406E,  69,  977,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM17,  48, 163N, 1397E,  48,  994,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM17,  60, 165N, 1383E,  39, 1003,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM18,   0, 135N, 1402E,  72,  966,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM18,  12, 146N, 1399E,  60,  981,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM18,  24, 151N, 1394E,  58,  985,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM18,  36, 155N, 1385E,  35, 1000,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM18,  48, 152N, 1366E,  37, 1003,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM19,   0, 135N, 1402E,  88,  960,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM19,  12, 145N, 1396E,  66,  975,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM19,  24, 151N, 1395E,  58,  980,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM19,  36, 156N, 1393E,  54,  991,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM19,  48, 160N, 1385E,  40, 1000,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM19,  60, 162N, 1375E,  38, 1003,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM20,   0, 135N, 1402E,  71,  964,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM20,  12, 146N, 1400E,  64,  979,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM20,  24, 153N, 1403E,  68,  977,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM20,  36, 158N, 1399E,  44,  993,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM20,  48, 159N, 1386E,  38, 1000,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM21,   0, 135N, 1402E,  85,  960,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM21,  12, 144N, 1400E,  72,  974,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM21,  24, 153N, 1397E,  66,  978,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM21,  36, 158N, 1390E,  49,  992,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM22,   0, 135N, 1402E,  93,  965,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM22,  12, 145N, 1397E,  67,  977,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM22,  24, 153N, 1399E,  72,  976,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM22,  36, 159N, 1395E,  42,  993,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM22,  48, 159N, 1382E,  37,  999,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM22,  60, 163N, 1362E,  35, 1003,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM23,   0, 135N, 1402E,  99,  953,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM23,  12, 145N, 1396E,  67,  977,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM23,  24, 153N, 1396E,  62,  973,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM23,  36, 159N, 1400E,  76,  971,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM23,  48, 160N, 1392E,  46,  992,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM23,  60, 160N, 1373E,  38, 1000,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM24,   0, 137N, 1402E,  75,  971,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM24,  12, 145N, 1402E,  69,  975,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM24,  24, 151N, 1397E,  65,  980,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM24,  36, 154N, 1389E,  45,  992,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM24,  48, 149N, 1375E,  39, 1000,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM25,   0, 135N, 1402E,  71,  966,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM25,  12, 148N, 1402E,  72,  972,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM25,  24, 155N, 1402E,  69,  972,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM25,  36, 160N, 1403E,  58,  986,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM25,  48, 162N, 1393E,  39,  997,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM25,  60, 160N, 1376E,  36, 1001,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM26,   0, 135N, 1402E, 103,  958,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM26,  12, 144N, 1396E,  74,  974,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM26,  24, 149N, 1390E,  47,  985,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM26,  36, 153N, 1389E,  48,  992,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM26,  48, 155N, 1375E,  41,  998,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM26,  60, 152N, 1362E,  32, 1002,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM27,   0, 135N, 1402E,  65,  966,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM27,  12, 146N, 1402E,  75,  970,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM27,  24, 153N, 1402E,  69,  973,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM27,  36, 155N, 1402E,  47,  988,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM27,  48, 160N, 1395E,  42,  996,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM27,  60, 160N, 1379E,  33, 1001,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM28,   0, 135N, 1402E,  98,  958,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM28,  12, 145N, 1397E,  68,  977,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM28,  24, 151N, 1396E,  52,  985,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM28,  36, 153N, 1395E,  49,  994,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM28,  48, 155N, 1385E,  36, 1001,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM28,  60, 152N, 1369E,  34, 1004,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM29,   0, 135N, 1402E,  72,  963,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM29,  12, 146N, 1400E,  72,  971,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM29,  24, 155N, 1403E,  63,  974,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM29,  36, 159N, 1406E,  54,  988,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM29,  48, 165N, 1403E,  36,  999,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM29,  60, 166N, 1397E,  40, 1002,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM30,   0, 135N, 1402E,  91,  961,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM30,  12, 145N, 1396E,  72,  975,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM30,  24, 149N, 1393E,  64,  977,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM30,  36, 151N, 1386E,  46,  987,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM30,  48, 151N, 1371E,  44,  997,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM31,   0, 137N, 1402E,  90,  958,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM31,  12, 146N, 1397E,  68,  975,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM31,  24, 155N, 1402E,  81,  966,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM31,  36, 162N, 1402E,  48,  990,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM31,  48, 162N, 1395E,  42,  997,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM31,  60, 158N, 1383E,  39, 1002,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM32,   0, 135N, 1402E,  87,  966,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM32,  12, 145N, 1400E,  69,  972,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM32,  24, 151N, 1397E,  62,  974,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM32,  36, 153N, 1396E,  47,  988,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM32,  48, 152N, 1382E,  43,  998,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM32,  60, 153N, 1359E,  40, 1001,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM32,  72, 164N, 1338E,  34, 1003,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM32,  84, 175N, 1317E,  28, 1007,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM32,  96, 183N, 1316E,  29, 1011,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM32, 108, 188N, 1323E,  29, 1008,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM32, 120, 196N, 1320E,  28, 1010,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM33,   0, 135N, 1402E,  95,  954,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM33,  12, 145N, 1399E,  64,  975,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM33,  24, 153N, 1400E,  78,  965,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM33,  36, 162N, 1409E,  72,  970,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM33,  48, 169N, 1414E,  59,  987,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM34,   0, 135N, 1402E,  61,  970,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM34,  12, 145N, 1400E,  69,  974,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM34,  24, 152N, 1399E,  66,  979,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM34,  36, 155N, 1390E,  45,  992,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM34,  48, 152N, 1375E,  37, 1000,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM35,   0, 135N, 1402E,  89,  960,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM35,  12, 145N, 1400E,  73,  971,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM35,  24, 155N, 1400E,  66,  975,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM35,  36, 160N, 1397E,  50,  988,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM35,  48, 162N, 1386E,  45,  997,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM35,  60, 161N, 1372E,  36, 1001,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM36,   0, 137N, 1402E,  94,  964,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM36,  12, 146N, 1399E,  66,  974,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM36,  24, 153N, 1399E,  78,  968,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM36,  36, 158N, 1397E,  62,  987,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM36,  48, 155N, 1385E,  36, 1000,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM36,  60, 148N, 1371E,  36, 1003,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM37,   0, 135N, 1402E,  71,  967,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM37,  12, 142N, 1392E,  65,  980,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM37,  24, 146N, 1387E,  53,  987,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM37,  36, 145N, 1376E,  50,  994,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM37,  48, 141N, 1354E,  38, 1000,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM38,   0, 135N, 1402E,  84,  957,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM38,  12, 146N, 1402E,  71,  970,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM38,  24, 155N, 1402E,  69,  972,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM38,  36, 162N, 1402E,  48,  987,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM38,  48, 163N, 1395E,  40,  997,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM38,  60, 169N, 1387E,  35, 1000,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM39,   0, 135N, 1402E,  83,  962,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM39,  12, 145N, 1400E,  63,  972,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM39,  24, 156N, 1402E,  69,  970,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM39,  36, 163N, 1407E,  50,  983,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM39,  48, 163N, 1404E,  45,  996,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM39,  60, 162N, 1393E,  41, 1000,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM40,   0, 135N, 1402E,  66,  962,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM40,  12, 145N, 1399E,  65,  975,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM40,  24, 151N, 1399E,  70,  977,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM40,  36, 156N, 1387E,  47,  995,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM40,  48, 156N, 1368E,  37, 1000,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM41,   0, 135N, 1402E,  90,  957,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM41,  12, 146N, 1402E,  69,  971,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM41,  24, 155N, 1403E,  73,  970,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM41,  36, 163N, 1403E,  54,  987,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM41,  48, 165N, 1396E,  40,  997,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM41,  60, 166N, 1379E,  44, 1000,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM42,   0, 135N, 1402E,  77,  967,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM42,  12, 145N, 1397E,  61,  976,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM42,  24, 152N, 1397E,  67,  974,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM42,  36, 158N, 1400E,  60,  982,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM42,  48, 159N, 1389E,  42,  997,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM42,  60, 160N, 1373E,  35, 1002,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM43,   0, 135N, 1402E,  85,  970,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM43,  12, 145N, 1400E,  60,  980,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM43,  24, 151N, 1399E,  66,  977,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM43,  36, 158N, 1402E,  56,  986,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM43,  48, 160N, 1390E,  38,  998,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM43,  60, 163N, 1375E,  38, 1001,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM43,  72, 176N, 1357E,  40, 1005,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM44,   0, 135N, 1402E, 101,  954,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM44,  12, 149N, 1400E,  64,  975,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM44,  24, 155N, 1400E,  72,  977,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM44,  36, 160N, 1392E,  42,  993,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM44,  48, 160N, 1378E,  37,  998,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM44,  60, 160N, 1364E,  32, 1003,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM45,   0, 135N, 1402E,  87,  955,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM45,  12, 145N, 1399E,  69,  973,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM45,  24, 153N, 1400E,  66,  970,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM45,  36, 162N, 1403E,  59,  980,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM45,  48, 163N, 1395E,  42,  995,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM45,  60, 169N, 1379E,  38, 1000,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM46,   0, 135N, 1402E,  63,  969,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM46,  12, 145N, 1400E,  68,  975,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM46,  24, 152N, 1395E,  61,  984,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM46,  36, 156N, 1387E,  39,  996,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM46,  48, 155N, 1376E,  33, 1002,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM46,  60, 159N, 1365E,  37, 1003,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM47,   0, 135N, 1402E,  74,  962,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM47,  12, 145N, 1399E,  70,  973,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM47,  24, 149N, 1395E,  67,  981,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM47,  36, 152N, 1385E,  45,  993,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM47,  48, 152N, 1369E,  39,  999,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM48,   0, 135N, 1402E,  90,  962,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM48,  12, 146N, 1402E,  64,  974,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM48,  24, 155N, 1399E,  72,  970,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM48,  36, 160N, 1397E,  49,  988,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM48,  48, 159N, 1385E,  38,  998,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM48,  60, 159N, 1369E,  37, 1003,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM49,   0, 135N, 1402E,  63,  976,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM49,  12, 149N, 1400E,  58,  983,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM49,  24, 152N, 1397E,  49,  990,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM49,  36, 158N, 1395E,  39,  997,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM49,  48, 158N, 1386E,  34,  998,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM49,  60, 160N, 1373E,  29, 1003,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM50,   0, 135N, 1402E, 136,  948,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM50,  12, 142N, 1396E,  66,  974,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM50,  24, 152N, 1396E,  68,  973,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM50,  36, 158N, 1397E,  49,  985,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM50,  48, 158N, 1387E,  43,  996,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EM50,  60, 159N, 1371E,  39, 1000,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EMDT,   0, 136N, 1402E,  82,  959,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EMDT,  12, 145N, 1399E,  79,  961,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EMDT,  24, 152N, 1398E,  80,  963,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EMDT,  36, 157N, 1399E,  63,  985,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EMDT,  48, 157N, 1386E,  39,  997,   ,  34, NEQ,    0,    0,    0,    0,
WP, 02, 2019022500, 83, EMDT,  60, 155N, 1372E,  36, 1001,   ,  34, NEQ,    0,    0,    0,    0,
`;

function transLatLon(str='120N'){
  const numStr = str.slice(0,-1);
  const flag = str.slice(-1);
  const unsignedNum = Number(numStr)/10.0;
  const sign = flag.toUpperCase() =='N'||  flag.toUpperCase() =='E'? 1 : -1;
  return unsignedNum*sign;
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

function transStr(str=''){
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
  sortList.forEach(v=>v.type = setTcType(v.oriType,ecConfig));
  console.log(sortList);
  // TODO 去除重复的确定性预报
  // return sortList;
}
transStr(str);

/*
  0:wp,
  1:02
  2:2019022500
  3:83
  4:EM01
  5:step 0
  6:135N
  7:1402E
  8：80
  9:965
  10: 等级
  11: 风圈速度
  13:RAD1 NE
  14:RAD2 SE
  15: SW

*/