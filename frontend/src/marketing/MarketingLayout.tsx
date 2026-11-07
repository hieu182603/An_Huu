import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { BrandLogo, Drawer, Icon } from '../components/ui';
import { marketingNavigation } from './content';
import './marketing.css';
import './editorial-pages.css';

export function MarketingButton({ to = '/register', children, secondary = false, onClick }: { to?: string; children: ReactNode; secondary?: boolean; onClick?: () => void }) {
  return <Link className={`mk-button ${secondary ? 'mk-button-secondary' : ''}`} to={to} onClick={onClick}>{children}<Icon name="arrow-right" /></Link>;
}

export default function MarketingLayout({ children, home = false }: { children: ReactNode; home?: boolean }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { setOpen(false); }, [pathname]);

  const scrollToSection = (id: string) => {
    if (pathname === '/') {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return <div className={`mk-site ${home ? 'mk-home' : 'mk-interior'}`}>
    <header className="mk-header">
      <div className="mk-container mk-header-inner">
        <Link to="/" aria-label="Trang chủ An Hưu" className="mk-logo"><BrandLogo inverted height={34} /></Link>
        <nav className="mk-nav" aria-label="Điều hướng chính">
          {marketingNavigation.map(item => item.path.startsWith('/#') ? (
            <Link key={item.path} to={item.path} onClick={() => scrollToSection(item.path.slice(2))}>{item.label}</Link>
          ) : (
            <NavLink key={item.path} to={item.path} end={item.path === '/'}>{item.label}</NavLink>
          ))}
        </nav>
        <div className="mk-header-actions"><Link to="/login">Đăng nhập</Link><Link to="/register" className="mk-button mk-small">Bắt đầu miễn phí<Icon name="arrow-right" /></Link></div>
        <button className="mk-menu" type="button" aria-label="Mở menu" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(true)}><Icon name="grid" /></button>
      </div>
    </header>
    <Drawer open={open} title="An Hưu" onClose={() => setOpen(false)}>
      <nav className="mk-mobile-nav" aria-label="Điều hướng chính trên di động">
        {marketingNavigation.map(item => item.path.startsWith('/#') ? (
          <Link key={item.path} to={item.path} onClick={() => { setOpen(false); scrollToSection(item.path.slice(2)); }}>{item.label}</Link>
        ) : (
          <NavLink key={item.path} to={item.path} end={item.path === '/'} onClick={() => setOpen(false)}>{item.label}</NavLink>
        ))}
        <Link to="/login" onClick={() => setOpen(false)}>Đăng nhập</Link><Link to="/register" onClick={() => setOpen(false)}>Bắt đầu miễn phí</Link>
      </nav>
    </Drawer>
    <main id="main-content">{children}</main>
    <footer className="mk-footer"><div className="mk-container">
      <div className="mk-footer-top">
        <div className="mk-footer-brand"><Link to="/" aria-label="An Hưu - về trang chủ" className="mk-footer-logo"><BrandLogo inverted height={46} /></Link><p>Chuẩn bị hôm nay.<br /><span>An yên cho ngày mai.</span></p><small>Đồng hành cùng bạn trên hành trình chuẩn bị tài chính cho tuổi hưu.</small></div>
        <nav className="mk-footer-links" aria-label="Khám phá An Hưu"><h2>Khám phá</h2>{marketingNavigation.map(item => <Link key={item.path} to={item.path}>{item.label}</Link>)}</nav>
        <nav className="mk-footer-links" aria-label="Chính sách & Điều khoản">
          <h2>Chính sách</h2>
          <a href="/chinh-sach#bao-mat">Chính sách bảo mật</a>
          <a href="/chinh-sach#dieu-khoan">Điều khoản sử dụng</a>
          <a href="/chinh-sach#gia-dinh">Cơ sở giả định</a>
          <a href="/chinh-sach#mien-tru">Miễn trừ tư vấn</a>
        </nav>
        <div className="mk-footer-contact" aria-label="Thông tin liên hệ An Hưu">
          <h2>Thông tin liên hệ</h2>
          <ul className="mk-contact-list">
            <li>
              <a href="tel:0888509975" className="mk-contact-link">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                <span>088 850 99 75</span>
              </a>
            </li>
            <li>
              <a href="mailto:anhuuofficial@gmail.com" className="mk-contact-link">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                <span>anhuuofficial@gmail.com</span>
              </a>
            </li>
            <li>
              <a href="https://www.facebook.com/profile.php?id=61595126363889" target="_blank" rel="noopener noreferrer" className="mk-contact-link">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                <span>An Hưu (Facebook)</span>
              </a>
            </li>
          </ul>
        </div>
        <div className="mk-footer-start"><span className="mk-footer-start-icon"><Icon name="compass" /></span><h2>Bắt đầu thật đơn giản.</h2><p>Thử một kịch bản hưu trí.<br />Chưa cần tạo tài khoản.</p><Link to="/mo-phong">Thử mô phỏng<span><Icon name="arrow-right" /></span></Link></div>
      </div>
      <div className="mk-footer-bottom">
        <span>© An Hưu. Nền tảng lập kế hoạch hưu trí.</span>
        <small>Công cụ tham khảo. Không cam kết kết quả tài chính.</small>
      </div>
    </div></footer>
  </div>;
}

export function FinalCTA() {
  return <section className="mk-section mk-final"><div className="mk-container"><div className="mk-final-panel"><span className="mk-eyebrow">TƯƠNG LAI BẮT ĐẦU TỪ HÔM NAY</span><h2>Một bước nhỏ hôm nay.<br /><span>Một tuổi hưu chủ động.</span></h2><p>Cho những dự định ngày mai một kế hoạch rõ ràng.</p><MarketingButton>Bắt đầu lập kế hoạch</MarketingButton><small>Miễn phí trải nghiệm · Không cần thẻ ngân hàng</small></div></div></section>;
}

export function PageIntro({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return <div className="mk-page-intro mk-container"><span className="mk-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{children}</p></div>;
}
