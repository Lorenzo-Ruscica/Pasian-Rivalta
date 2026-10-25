document.addEventListener('DOMContentLoaded', () => {
    const navbar = document.querySelector('.navbar');
    const burger = document.querySelector('.burger');
    const nav = document.querySelector('.nav-links');
    const dropdownLink = document.querySelector('.dropdown > a');
    const dropdownLi = document.querySelector('.dropdown');

    // 1. Arricchisce il brand nella Top Bar mobile su tutte le pagine
    const currentPage = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const brandLink = navbar?.querySelector(':scope > a');
    if (brandLink) {
        brandLink.classList.add('pf-brand-link');
        const path = currentPage;
        const pageSubtitles = {
            'index.html': 'Ottica & Gioielleria',
            'storia.html': 'La Nostra Storia',
            'ottica.html': 'Collezione Ottica',
            'gioielleria.html': 'Alta Gioielleria',
            'card-famiglia.html': 'Card Famiglia',
            'contatti.html': 'Contatti & Orari',
            'admin.html': 'Pannello Cassa',
            'privacy.html': 'Privacy Policy',
            'cookie-policy.html': 'Cookie Policy'
        };
        const subText = pageSubtitles[path] || 'Dal 1981';

        if (!brandLink.querySelector('.pf-brand-emblem')) {
            const emblem = document.createElement('span');
            emblem.className = 'pf-brand-emblem';
            emblem.setAttribute('aria-hidden', 'true');
            brandLink.appendChild(emblem);
        }
        if (!brandLink.querySelector('.pf-brand-text')) {
            const textWrap = document.createElement('span');
            textWrap.className = 'pf-brand-text';
            textWrap.innerHTML = `
                <strong class="pf-brand-title">Pasian Rivalta</strong>
                <span class="pf-brand-sub">${subText}</span>
            `;
            brandLink.appendChild(textWrap);
        }
    }

    // 2. Costruisce il Drawer Menu Mobile di lusso per la navigazione tra le pagine
    if (nav && !nav.dataset.mobileEnhanced) {
        nav.dataset.mobileEnhanced = 'true';

        // Header del drawer mobile
        const drawerHeader = document.createElement('li');
        drawerHeader.className = 'mobile-nav-chrome mobile-nav-header';
        drawerHeader.innerHTML = `
            <div class="mnav-brand">
                <span class="pf-brand-emblem" aria-hidden="true"></span>
                <div class="pf-brand-text">
                    <strong class="pf-brand-title">Pasian Rivalta</strong>
                    <span class="pf-brand-sub">Rivalta di Torino · Dal 1981</span>
                </div>
            </div>
            <button type="button" class="mnav-close-btn" aria-label="Chiudi menu">
                <i class="fas fa-times" aria-hidden="true"></i>
            </button>
        `;
        nav.prepend(drawerHeader);

        // Metadati icone e sottotitoli per le voci di menu su mobile
        const itemMeta = {
            'index.html': { icon: 'fa-home', title: 'Home', sub: 'Pagina principale' },
            'storia.html': { icon: 'fa-award', title: 'La nostra storia', sub: 'Tradizione dal 1981' },
            'ottica.html': { icon: 'fa-glasses', title: 'Ottica', sub: 'Vista e sole' },
            'gioielleria.html': { icon: 'fa-gem', title: 'Gioielleria', sub: 'Gioielli e orologi' },
            'card-famiglia.html': { icon: 'fa-crown', title: 'Card Famiglia', sub: 'Sconti fino al -25%' },
            'contatti.html': { icon: 'fa-map-marker-alt', title: 'Contatti', sub: 'Orari e sede' }
        };

        // Assicura che "Card Famiglia" sia presente in tutte le pagine (es. privacy/cookie)
        if (!nav.querySelector('a[href="card-famiglia.html"]')) {
            const cfLi = document.createElement('li');
            cfLi.innerHTML = `<a href="card-famiglia.html"${currentPage === 'card-famiglia.html' ? ' class="active"' : ''}>Card Famiglia</a>`;
            const contattiLi = nav.querySelector('a[href="contatti.html"]')?.parentElement;
            if (contattiLi) {
                nav.insertBefore(cfLi, contattiLi);
            } else {
                nav.appendChild(cfLi);
            }
        }

        nav.querySelectorAll(':scope > li:not(.mobile-nav-chrome) > a').forEach((a) => {
            const href = (a.getAttribute('href') || '').split('/').pop().toLowerCase();
            const isDropdownToggle = a.parentElement?.classList.contains('dropdown');
            const meta = isDropdownToggle
                ? { icon: 'fa-layer-group', title: 'Collezioni', sub: 'Ottica e Gioielleria' }
                : itemMeta[href];

            if (!meta) return;

            const existingChevron = a.querySelector('i');
            const labelText = a.textContent.trim();

            a.innerHTML = `
                <span class="mnav-item-left">
                    <span class="mnav-icon" aria-hidden="true"><i class="fas ${meta.icon}"></i></span>
                    <span class="mnav-labels">
                        <span class="mnav-title">${labelText || meta.title}</span>
                        <span class="mnav-sub">${meta.sub}</span>
                    </span>
                </span>
                <i class="fas ${isDropdownToggle ? 'fa-chevron-down' : 'fa-chevron-right'} mnav-arrow" aria-hidden="true"></i>
            `;
            if (existingChevron && isDropdownToggle) {
                a.querySelector('.mnav-arrow')?.classList.add('dropdown-chevron');
            }
        });

        // Arricchisce le 2 card del sottomenu Collezioni (Ottica / Gioielleria)
        nav.querySelectorAll('.dropdown-menu a').forEach((subA) => {
            const href = (subA.getAttribute('href') || '').split('/').pop().toLowerCase();
            const meta = itemMeta[href];
            if (!meta) return;
            const label = subA.textContent.trim();
            subA.innerHTML = `
                <span class="mnav-subcard-icon" aria-hidden="true"><i class="fas ${meta.icon}"></i></span>
                <span class="mnav-subcard-body">
                    <strong class="mnav-subcard-title">${label}</strong>
                    <span class="mnav-subcard-sub">${meta.sub}</span>
                </span>
            `;
        });

        // Su mobile mostra subito aperta la griglia Ottica / Gioielleria
        if (dropdownLi && window.innerWidth <= 968) {
            dropdownLi.classList.add('mobile-active');
        }

        // Footer del drawer mobile con contatti rapidi e social
        const drawerFooter = document.createElement('li');
        drawerFooter.className = 'mobile-nav-chrome mobile-nav-footer';
        drawerFooter.innerHTML = `
            <div class="mnav-footer-actions">
                <a href="tel:+393396971317" class="mnav-quick-btn">
                    <i class="fas fa-phone" aria-hidden="true"></i>
                    <span>Chiama negozio</span>
                </a>
                <a href="contatti.html" class="mnav-quick-btn">
                    <i class="fas fa-location-arrow" aria-hidden="true"></i>
                    <span>Via F. Bocca 30</span>
                </a>
            </div>
            <div class="mnav-socials-row">
                <a href="https://www.facebook.com/pasian.rivalta/?locale=it_IT" target="_blank" rel="noopener" aria-label="Facebook Pasian Rivalta">
                    <i class="fab fa-facebook-f" aria-hidden="true"></i>
                </a>
                <a href="https://www.instagram.com/pasianrivalta/" target="_blank" rel="noopener" aria-label="Instagram Pasian Rivalta">
                    <i class="fab fa-instagram" aria-hidden="true"></i>
                </a>
            </div>
        `;
        nav.appendChild(drawerFooter);
    }

    function setMobileMenuOpen(isOpen) {
        if (!nav || !burger) return;
        nav.classList.toggle('nav-active', isOpen);
        document.body.classList.toggle('mobile-nav-open', isOpen);
        burger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        burger.innerHTML = isOpen
            ? '<i class="fas fa-times" aria-hidden="true"></i>'
            : '<i class="fas fa-bars" aria-hidden="true"></i>';
    }

    if (burger && nav) {
        burger.addEventListener('click', () => {
            const willOpen = !nav.classList.contains('nav-active');
            setMobileMenuOpen(willOpen);
        });

        nav.querySelector('.mnav-close-btn')?.addEventListener('click', () => {
            setMobileMenuOpen(false);
        });

        // Chiude il menu toccando un link di navigazione
        nav.querySelectorAll('a[href]:not([href="#"])').forEach((link) => {
            link.addEventListener('click', () => setMobileMenuOpen(false));
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && nav.classList.contains('nav-active')) {
                setMobileMenuOpen(false);
            }
        });
    }

    if (dropdownLink && dropdownLi) {
        dropdownLink.addEventListener('click', (e) => {
            if (window.innerWidth <= 968) {
                e.preventDefault();
                dropdownLi.classList.toggle('mobile-active');
            }
        });
    }

    const cookieBanner = document.getElementById('cookie-banner');
    const acceptBtn = document.getElementById('accept-cookies');

    if (!localStorage.getItem('cookiesAccepted')) {
        if (cookieBanner) {
            setTimeout(() => {
                cookieBanner.style.display = 'flex';
                setTimeout(() => cookieBanner.classList.add('show'), 10);
            }, 1000);
        }
    } else if (cookieBanner) {
        cookieBanner.style.display = 'none';
    }

    if (acceptBtn) {
        acceptBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (cookieBanner) {
                cookieBanner.style.display = 'none';
                cookieBanner.classList.remove('show');
            }
            localStorage.setItem('cookiesAccepted', 'true');
        });
    }

    if (navbar) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 30) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }
        });
    }

    const revealElements = document.querySelectorAll('.reveal');
    if (revealElements.length && 'IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('active');
                }
            });
        }, { threshold: 0.1 });

        revealElements.forEach((el) => observer.observe(el));
    }
});
