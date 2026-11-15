/** Round to whole dong for display without losing integer precision. */
export function formatMoneyDecimal(value:string|null|undefined,en=false):string{
 if(value==null||!/^[-]?\d+(\.\d+)?$/.test(value))return en?"Undetermined":"Chưa xác định";
 const [whole,fraction=""]=value.replace(/^-/,'').split('.');
 const rounded=BigInt(whole)+(fraction[0]>='5'?1n:0n);
 const digits=new Intl.NumberFormat(en?'en-US':'vi-VN').format(rounded);
 return `${value.startsWith('-')&&rounded!==0n?'-':''}${digits} ₫`;
}

/** Abbreviate only for display; retain the exact decimal for the full amount. */
export function formatCompactMoneyDecimal(value:string|null|undefined,en=false):string{
 if(value==null||!/^[-]?\d+(\.\d+)?$/.test(value))return formatMoneyDecimal(value,en);
 const [whole,fraction=""]=value.replace(/^-/,'').split('.');
 const absolute=BigInt(whole),places=absolute>=1000000000n?9:absolute>=1000000n?6:0;
 if(!places)return formatMoneyDecimal(value,en);
 const unit=10n**BigInt(places), tenths=(absolute*10n+unit/2n)/unit;
 const integer=new Intl.NumberFormat(en?'en-US':'vi-VN').format(tenths/10n);
 const decimal=tenths%10n;
 return `${value.startsWith('-')?'-':''}${integer}${decimal?(en?'.':',')+decimal.toString():''} ${places===9?(en?'billion':'tỷ'):(en?'million':'triệu')} ₫`;
}
