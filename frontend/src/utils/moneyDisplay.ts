/** Display money to cents without converting server decimal strings to Number. */
export function formatMoneyDecimal(value:string|null|undefined,en=false):string{
 if(value==null||!/^[-]?\d+(\.\d+)?$/.test(value))return en?"Undetermined":"Chưa xác định";
 const [whole,fraction=""]=value.replace(/^-/,'').split('.');
 const cents=BigInt(whole)*100n+BigInt(fraction.slice(0,2).padEnd(2,'0'))+(fraction[2]>='5'?1n:0n);
 const digits=new Intl.NumberFormat(en?'en-US':'vi-VN').format(cents/100n),decimals=(cents%100n).toString().padStart(2,'0').replace(/0+$/,'');
 return `${value.startsWith('-')&&cents!==0n?'-':''}${digits}${decimals?(en?'.':',')+decimals:''} ₫`;
}
