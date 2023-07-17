// 去重
const mongoose = require('mongoose');
let Cyclone = mongoose.model('Cyclone');

/**
 * 储存单条TC数据
 * @param {Object} fcData 一条TC数据
 */
async function save2DB(fcData={tcID:''}){
  const findTC = await Cyclone.findOne({tcID:fcData.tcID})
                             .exec();
  
  if(findTC){//判断填充功能
    if(findTC.tracks && fcData.tracks && fcData.tracks.length>findTC.tracks.length){// 更新集合预报
      findTC.tracks = fcData.tracks;
      findTC.controlIndex = fcData.controlIndex;
      findTC.maxWind = fcData.maxWind;
      findTC.loc = fcData.loc;
      if(findTC.fillStatus==1){
        findTC.fillStatus = findTC.fillStatus===3;
      }else if(findTC.fillStatus==2){
        findTC.fillStatus = findTC.fillStatus===2;
      }else if (findTC.fillStatus==3){
        findTC.fillStatus = findTC.fillStatus===3;
      }else{
        findTC.fillStatus = 2
      }
    }
    if(findTC.detTrack && fcData.detTrack && fcData.detTrack.track.length>findTC.detTrack.track.length){// 更新确定性预报
      if(fcData.detTrack){
        findTC.detTrack = fcData.detTrack;
        findTC.detLoc = fcData.detLoc;
      }else{
        findTC.detTrack = fcData.tracks[0];
        findTC.detLoc = fcData.loc;
      }
      if(findTC.fillStatus==1){
        findTC.fillStatus = findTC.fillStatus===1;
      }else if(findTC.fillStatus==2){
        findTC.fillStatus = findTC.fillStatus===3;
      }else if (findTC.fillStatus==3){
        findTC.fillStatus = findTC.fillStatus===3;
      }else{
        findTC.fillStatus = 1
      }
    }

    if(findTC.fillStatus===3||findTC.fillStatus===fcData.fillStatus){
      console.log(fcData.tcID+'已存在,跳出保存');
    }else{
      if(fcData.fillStatus==2){
        findTC.tracks = fcData.tracks;
        findTC.controlIndex = fcData.controlIndex;
        findTC.maxWind = fcData.maxWind;
        findTC.loc = fcData.loc;
        findTC.fillStatus = findTC.fillStatus===1?3:2;
      }else if(fcData.fillStatus==1){// 只有确定性预报
        //console.log(fcData.tracks);
        if(fcData.detTrack){
          findTC.detTrack = fcData.detTrack;
          findTC.detLoc = fcData.detLoc;
        }else{
          findTC.detTrack = fcData.tracks[0];
          findTC.detLoc = fcData.loc;
        }
        findTC.fillStatus = findTC.fillStatus===2?3:1;
      }else if(fcData.fillStatus==3){// 只有确定性预报
        findTC.tracks = fcData.tracks;
        findTC.controlIndex = fcData.controlIndex;
        findTC.maxWind = fcData.maxWind;
        findTC.loc = fcData.loc;
        if(fcData.detTrack){
          findTC.detTrack = fcData.detTrack;
          findTC.detLoc = fcData.detLoc;
        }else{
          findTC.detTrack = fcData.tracks[0];
          findTC.detLoc = fcData.loc;
        }
        findTC.fillStatus = 3;
      }else if(fcData.fillStatus==0){
        //console.log(fcData.tracks);
        console.log('没有查询到任何路径'+fcData.tcID);
      }else{
        console.log('意外的fillStatus,旧:'+findTC.fillStatus+',新: '+fcData.fillStatus);
        return;
      }
      await findTC.save()
      .then(()=>{
        console.log('更新'+findTC.tcID);
      })
      .catch(err=>{
        console.log('更新错误');
        // console.error(err);
        throw err;
      })
    }
    
  }else{
    let cyclone;
    if(fcData.fillStatus==1){
      //console.log(fcData.tracks);
      if(fcData.detTrack){// 如果已经有detTrack则保留住数据
        ''
      }else{
        fcData.detTrack = fcData.tracks[0];
        fcData.detLoc = fcData.loc;
      }
      delete fcData.tracks;
      delete fcData.loc;
      cyclone = new Cyclone(fcData);
    }else if(fcData.fillStatus==0){
      console.log('没有查询到任何路径'+fcData.tcID);
    }else{
      cyclone = new Cyclone(fcData);
    }
    await cyclone.save()
    .then(()=>{
      console.log('储存完成'+fcData.tcID);
    })
    .catch(err=>{
      console.log('储存错误');
      // console.error(err);
      throw err;
    })
  }
}

exports.save2DB = save2DB;