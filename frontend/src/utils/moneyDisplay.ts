/** Display money to cents without converting server decimal strings to Number. */
export function formatMoneyDecimal(value:string|null|undefined,en=false):string{
 if(value==null||!/^[-]?\d+(\.\d+)?$/.test(value))return en?"Undetermined":"Chưa xác định";
 const [whole,fraction=""]=value.replace(/^-/,'').split('.');
 const cents=BigInt(whole)*100n+BigInt(fraction.slice(0,2).padEnd(2,'0'))+(fraction[2]>='5'?1n:0n);
 const digits=new Intl.NumberFormat(en?'en-US':'vi-VN').format(cents/100n),decimals=(cents%100n).toString().padStart(2,'0').replace(/0+$/,'');
 return `${value.startsWith('-')&&cents!==0n?'-':''}${digits}${decimals?(en?'.':',')+decimals:''} ₫`;
}

/** Abbreviate only for display; retain the exact decimal for the full amount. */
export function formatCompactMoneyDecimal(value:string|null|undefined,en=false):string{
 if(value==null||!/^[-]?\d+(\.\d+)?$/.test(value))return formatMoneyDecimal(value,en);
 const [whole,fraction=""]=value.replace(/^-/,'').split('.');
 const absolute=BigInt(whole),places=absolute>=1000000000n?9:absolute>=1000000n?6:0;
 if(!places)return formatMoneyDecimal(value,en);
 const digits=whole.padStart(places+1,'0'),split=digits.length-places;
 const scaled=`${value.startsWith('-')?'-':''}${digits.slice(0,split)}.${digits.slice(split)}${fraction}`;
 return formatMoneyDecimal(scaled,en).replace(/ ₫$/,` ${places===9?(en?'billion':'tỷ'):(en?'million':'triệu')} ₫`);
}
