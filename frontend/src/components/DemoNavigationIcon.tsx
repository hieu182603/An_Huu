import { Icon, type IconName } from "./ui";
const paths: Record<string,string> = {
  "search": "<circle cx=\"10.5\" cy=\"10.5\" r=\"6.5\"/><path d=\"m16 16 5 5\"/>",
  "cart": "<circle cx=\"9\" cy=\"21\" r=\"1\"/><circle cx=\"20\" cy=\"21\" r=\"1\"/><path d=\"M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6\"/>",
  "target": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><circle cx=\"12\" cy=\"12\" r=\"5\"/><circle cx=\"12\" cy=\"12\" r=\"1\"/>",
  "compare": "<path d=\"M4 7h15l-3-3m4 13H5l3 3M4 7v5m16 5v-5\"/>",
  "debt": "<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"3\"/><path d=\"M3 10h18M7 15h3\"/>",
  "book": "<path d=\"M12 5v16M12 5C8 2 4 3 2 4v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-2-1-6-2-10 1Z\"/>",
  "spark": "<path d=\"m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM21 2v4m-2-2h4\"/>",
  "bell": "<path d=\"M6 9a6 6 0 0 1 12 0c0 7 3 7 3 8H3c0-1 3-1 3-8m6-8v2m-3 17a3 3 0 0 0 6 0\"/>",
  "chevron": "<path d=\"m8 10 4 4 4-4\"/>",
  "panel": "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M9 4v16m6-12-3 4 3 4\"/>",
  "menu": "<path d=\"M4 6h16M4 12h16M4 18h16\"/>",
  "settings": "<path d=\"M4 6h16M4 12h16M4 18h16\"/><circle cx=\"9\" cy=\"6\" r=\"2\"/><circle cx=\"16\" cy=\"12\" r=\"2\"/><circle cx=\"8\" cy=\"18\" r=\"2\"/>",
  "download": "<path d=\"M12 3v12m-4-4 4 4 4-4M4 15v6h16v-6\"/>",
  "arrow": "<path d=\"M5 12h14m-6-6 6 6-6 6\"/>",
  "home": "<path d=\"m3 10 9-7 9 7v10H3V10Z\"/><path d=\"M9 20v-7h6v7\"/>",
  "wallet": "<rect x=\"3\" y=\"5\" width=\"18\" height=\"15\" rx=\"2\"/><path d=\"M3 7V5a2 2 0 0 1 2-2h12v2M21 11h-6v5h6m-3-2.5h.01\"/>",
  "shield": "<path d=\"m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z\"/><path d=\"m8 12 3 3 5-6\"/>",
  "plan": "<path d=\"M6 3h12v18H6zM9 7h6M9 11h6M9 15h3\"/>",
  "chart": "<path d=\"M4 3v17h17M8 14l4-5 4 2 5-7\"/>",
  "user": "<circle cx=\"12\" cy=\"8\" r=\"4\"/><path d=\"M4 21v-3a8 8 0 0 1 16 0v3\"/>",
  "help": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3h.01\"/>",
};
const aliases: Record<string,string> = {"grid": "menu", "target": "target", "compass": "plan", "users": "user", "life-buoy": "help", "sparkles": "spark", "briefcase": "cart", "file-text": "book", "message": "chat"};
export default function DemoNavigationIcon({name}: {name:IconName}) { const path=paths[aliases[name]??name]; return path ? <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{__html:path}}/> : <Icon name={name}/>; }
