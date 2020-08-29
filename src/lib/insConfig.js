const ncepConfig = {
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
        if(str=='TGFS2'){
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
  ins:'NCEP-R',
  detNameList:['TGFS2','AVNO','AVNI'],
  ensNumber:21,
}

let ukmoConfig = {
  typeList : [
    {
      type:"ensembleForecast",
      filter(str='UK35'){// UEP35
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
        }else if(str=='UKMI'){
          return {
            type:"determineForecast",
            "ensembleNumber": -4,
            oriType:str,
          }
        }
        else{
          return false;
        }
      }
    },
  ],
  ins:'UKMO-R',
  detNameList:['TUKM2','UEDET','UKM'],
  ensNumber:36,
}

const cmcConfig = {
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
      filter(str='CMC'){
        let detList = ['CMC','CMCI','CMC2'];
        let meanList = ['CEMI','CEM2'];
        if(detList.includes(str.toUpperCase())){
          return {
            type:"determineForecast",
            "ensembleNumber": -1,
            oriType:str,
          }
        }else if(meanList.includes(str.toUpperCase())){
          return {
            type:"ensembleMean",
            "ensembleNumber": -10,
            oriType:str,
          }
        }else{
          return false;
        }
      }
    },
  ],
  ins:'CMC-R',
  detNameList:['CMC','CMCI','CMC2'],
  ensNumber:21,
};

const fnmocConfig = {
  typeList : [
    {
      type:"ensembleForecast",
      filter(str='NP01'){
        const reg =  /.*?(\d{2})/;
        const result = str.match(reg);// Array ["EM01", "01"]
        if(result){
          return {
            type:"ensembleForecast",
            ensembleNumber: Number(result[1]),
            oriType:str,
          }
        }else if(meanList.includes(det=>det===str.toUpperCase())){
          return {
            type:"ensembleMean",
            "ensembleNumber": -10,
            oriType:str,
          }
        }else{
          return false;
        }
      },
    },
    {
      type:'determineForecast',
      filter(str='NGX'){
        let detList = ['NGX','NGXI','NGX2','NGPS','NGPI','NGP2'];
        if(detList.includes(str.toUpperCase())){
          return {
            type:"determineForecast",
            "ensembleNumber": -1,
            oriType:str,
          }
        }
        else{
          return false;
        }
      }
    },
  ],
  ins:'FNMOC-R',
  detNameList:['NGX','NGXI','NGX2','NGPS','NGPI','NGP2'],
  ensNumber:20,
};

let ecConfig = {
  typeList : [
    {
      type:"ensembleForecast",
      filter(str='EM01'){
        const reg =  /.*?(\d{2})/;
        const result = str.match(reg);// Array ["EM01", "01"]
        if(result){
          let ensNumer = Number(result[1]);
          if(str.toLowerCase().startsWith('ep')){
            ensNumer = ensNumer + 25;
          }
          return {
            type:"ensembleForecast",
            ensembleNumber: ensNumer,
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
  ins:'EC-R',
  detNameList:['EMDT','ECMO','ECMF'],
  ensNumber:51,
};

function selectConfig(ins='ecmwf'){
  if (ins==='ecmwf') {
    return ecConfig;
  } else if(ins==='ncep') {
    return ncepConfig;
  }else if(ins==='ukmo') {
    return ukmoConfig;
  }else if(ins==='cmc') {
    return cmcConfig;
  }else if(ins==='fnmoc') {
    return fnmocConfig;
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
