document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. COOKIE BANNER (Priorità Alta) ---
    const cookieBanner = document.getElementById('cookie-banner');
    const acceptBtn = document.getElementById('accept-cookies');

    // Funzione per nascondere il banner
    function hideBanner() {
        if(cookieBanner) {
            cookieBanner.classList.remove('show');
            cookieBanner.style.display = 'none'; // Rimozione forzata
        }
    }

    if (acceptBtn) {
        // Aggiungiamo l'evento click
        acceptBtn.addEventListener('click', (e) => {
            e.preventDefault(); // Previene comportamenti strani
            hideBanner();
            localStorage.setItem('cookiesAccepted', 'true');
        });
        
        // Supporto per il touch su mobile (nel caso il click fallisca)
        acceptBtn.addEventListener('touchstart', (e) => {
            // e.preventDefault(); // Non prevenire il default qui per permettere il click
            hideBanner();
            localStorage.setItem('cookiesAccepted', 'true');
        }, {passive: true});
    }

    // Mostra il banner dopo 1 secondo se non accettato
    if (!localStorage.getItem('cookiesAccepted') && cookieBanner) {
        setTimeout(() => {
            cookieBanner.classList.add('show');
        }, 1000);
    } else if (cookieBanner) {
        // Se già accettato, nascondilo subito per sicurezza
        cookieBanner.style.display = 'none';
    }

    // --- 2. MENU MOBILE ---
    const burger = document.querySelector('.burger');
    const nav = document.querySelector('.nav-links');

    if (burger && nav) {
        burger.addEventListener('click', () => {
            nav.classList.toggle('nav-active');
            burger.classList.toggle('toggle');
            
            // Cambio icona
            if (nav.classList.contains('nav-active')) {
                burger.innerHTML = '<i class="fas fa-times"></i>';
                burger.style.color = "#d4af37";
            } else {
                burger.innerHTML = '<i class="fas fa-bars"></i>';
                burger.style.color = "#fff";
            }
        });
    }

    // --- 3. DROPDOWN MOBILE (Click su "Collezioni") ---
    const dropdownLink = document.querySelector('.dropdown > a');
    const dropdownLi = document.querySelector('.dropdown');

    if (dropdownLink && dropdownLi) {
        dropdownLink.addEventListener('click', (e) => {
            // Attiva solo su mobile (sotto i 968px)
            if (window.innerWidth <= 968) {
                e.preventDefault(); 
                dropdownLi.classList.toggle('mobile-active');
                
                // Ruota la freccina
                const arrow = dropdownLink.querySelector('i');
                if (arrow) {
                    if (dropdownLi.classList.contains('mobile-active')) {
                        arrow.style.transform = "rotate(180deg)";
                    } else {
                        arrow.style.transform = "rotate(0deg)";
                    }
                }
            }
        });
    }

    // --- 4. NAVBAR STICKY ---
    const navbar = document.querySelector('.navbar');
    if (navbar) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 30) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }
        });
    }

    // --- 5. ANIMAZIONI SCROLL ---
    const revealElements = document.querySelectorAll('.reveal');
    if (revealElements.length > 0) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('active');
                }
            });
        }, { threshold: 0.1 });

        revealElements.forEach(el => observer.observe(el));
    }
});