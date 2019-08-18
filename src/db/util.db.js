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
    if(findTC.fillStatus===3||findTC.fillStatus===fcData.fillStatus){
      console.log(fcData.tcID+'已存在,跳出保存');
    }else{
      if(fcData.fillStatus==2){
        findTC.tracks = fcData.tracks;
        findTC.controlIndex = fcData.controlIndex;
        findTC.maxWind = fcData.maxWind;
        findTC.loc = fcData.loc;
        findTC.fillStatus += 2;
      }else if(fcData.fillStatus==1){
        //console.log(fcData.tracks);
        findTC.detTrack = fcData.tracks[0];
        findTC.detLoc = fcData.loc;
        findTC.fillStatus += 1;
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
      fcData.detTrack = fcData.tracks[0];
      fcData.detLoc = fcData.loc;
      delete fcData.tracks;
      delete fcData.loc;
      cyclone = new Cyclone(fcData);
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