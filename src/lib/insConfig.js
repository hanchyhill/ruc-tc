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
  ins:'EC-N',
  detNameList:['EMDT','ECMO','ECMF'],
}
let ncepConfig = {
  typeList : [
    {
      type:"ensembleForecast",
      filter(str='AP01'){
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
      filter(str='TGFS2'){
        if('TGFS2'){
          return {
            type:"determineForecast",
            "ensembleNumber": -1,
            oriType:str,
          }
        }else if(str=='AVNO'||str=='AVNI'){
          return {
            type:"determineForecast",
            "ensembleNumber": -2,
            oriType:str,
          }
        }else if(str=='AEMN'){
          return {
            type:"ensembleMean",
            "ensembleNumber": -10,
            oriType:str,
          }
        }
        else{
          return false;
        }
      }
    },
  ],
  ins:'NCEP-N',
  detNameList:['TGFS2','AVNO','AVNI'],
}

let ukmoConfig = {
  typeList : [
    {
      type:"ensembleForecast",
      filter(str='UEP35'){
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
      filter(str='TUKM2'){
        if('TUKM2'){
          return {
            type:"determineForecast",
            "ensembleNumber": -1,
            oriType:str,
          }
        }else if(str=='UEDET'){
          return {
            type:"determineForecast",
            "ensembleNumber": -2,
            oriType:str,
          }
        }else if(str=='UKM'){
          return {
            type:"determineForecast",
            "ensembleNumber": -3,
            oriType:str,
          }
        }
        else{
          return false;
        }
      }
    },
  ],
  ins:'UKMO',
  detNameList:['TUKM2','UEDET','UKM'],
}

function selectConfig(ins='ecmwf'){
  if (ins==='ecmwf') {
    return ecConfig;
  } else if(ins==='ncep') {
    return ncepConfig;
  }else{
    throw new TypeError('not valid ins');
  }
}

const ncepName = ['AC00',//控制预报
'AP01',//集合1
'TGFS2',// 新GFS确定性预报
'AVNO',// GFS Model确定性预报, 首要第一
'AVNI',// GFS Model (Interpolated 06 hours)
'AEMN',//集合平均
];
const ecName = [
  'ECMO',//ECMWF model [GTS tracker]
  'ECDT',//确定性预报
  'ECME',// 控制预报
];

exports.selectConfig = selectConfig;
