import { renderToString } from 'react-dom/server';
import { Routes, Route, StaticRouter } from 'react-router';
import LandingPage from '../pages/LandingPage';
import { AssistantPage, HowItWorksPage, SimulationPage } from './MarketingPages';
export { pageMetadata } from './content';
export { renderSeoHead, validatedSiteUrl } from './seo';

export function renderPage(path: string) {
  return renderToString(<StaticRouter location={path}><a className="skip-link" href="#main-content">Đến nội dung chính</a><Routes>
    <Route path="/" element={<LandingPage />} />
    <Route path="/cach-hoat-dong" element={<HowItWorksPage />} />
    <Route path="/mo-phong" element={<SimulationPage />} />
    <Route path="/tro-ly-ai" element={<AssistantPage />} />
  </Routes></StaticRouter>);
}
