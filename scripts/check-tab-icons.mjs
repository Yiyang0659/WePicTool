import {inflateSync} from 'node:zlib';

// Native tabBar requires packaged raster files; verify actual data, not extension alone.
export function checkTabIcons(app, read) {
  const errors=[];
  for(const tab of app?.tabBar?.list || []) for(const field of ['iconPath','selectedIconPath']) {
    const name=tab[field];
    if(typeof name!=='string' || !name || name.startsWith('/') || name.split(/[\\/]/).includes('..')) {
      errors.push(`tabBar ${field} 路径不合法`);continue;
    }
    try {
      const b=read(name);
      if(b.length<33 || b.length>40960 || b.subarray(0,8).toString('hex')!=='89504e470d0a1a0a') throw Error('PNG');
      const width=b.readUInt32BE(16),height=b.readUInt32BE(20);
      if(!width||!height||width>81||height>81||b[24]!==8||b[25]!==6||b[28]!==0) throw Error('RGBA8');
      let pos=8,end=false;const data=[];
      while(pos+12<=b.length){
        const size=b.readUInt32BE(pos),type=b.toString('ascii',pos+4,pos+8);
        if(pos+12+size>b.length) throw Error('truncated');
        if(type==='IDAT') data.push(b.subarray(pos+8,pos+8+size));
        pos+=size+12;if(type==='IEND'){end=true;break;}
      }
      if(!end||inflateSync(Buffer.concat(data),{maxOutputLength:81*325}).length!==height*(1+width*4)) throw Error('data');
    } catch(_) {errors.push(`tabBar 图标缺失或不是有效的81px以内RGBA PNG：${name}`);}
  }
  return errors;
}
