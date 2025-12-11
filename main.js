document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. NAVBAR STICKY (Effetto Sfondo allo scroll) ---
    const navbar = document.querySelector('.navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 30) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // --- 2. MENU MOBILE (Apertura/Chiusura Generale) ---
    const burger = document.querySelector('.burger');
    const nav = document.querySelector('.nav-links');
    const navLinksItems = document.querySelectorAll('.nav-links li');

    if (burger) {
        burger.addEventListener('click', () => {
            // Apre/Chiude il menu
            nav.classList.toggle('nav-active');
            
            // Animazione icona Burger
            burger.classList.toggle('toggle');
            
            // Cambia icona da Burger a X
            if (nav.classList.contains('nav-active')) {
                burger.innerHTML = '<i class="fas fa-times"></i>'; // Icona X
                burger.style.color = "#d4af37"; // Oro
            } else {
                burger.innerHTML = '<i class="fas fa-bars"></i>'; // Icona Menu
                burger.style.color = "#fff"; // Bianco
            }
        });
    }

    // --- 3. DROPDOWN SU MOBILE (Logica a Fisarmonica) ---
    // Selezioniamo il link che contiene "Collezioni"
    const dropdownLink = document.querySelector('.dropdown > a');
    const dropdownLi = document.querySelector('.dropdown');

    if (dropdownLink) {
        dropdownLink.addEventListener('click', (e) => {
            // Questa logica si attiva solo se siamo su schermi piccoli (mobile/tablet)
            if (window.innerWidth <= 968) {
                e.preventDefault(); // Blocca il link (non ricarica la pagina)
                e.stopPropagation(); // Ferma altri eventi
                
                // Aggiunge la classe 'active' al genitore per mostrare il menu
                dropdownLi.classList.toggle('mobile-active');
                
                // Ruota la freccina
                const arrow = dropdownLink.querySelector('i');
                if (dropdownLi.classList.contains('mobile-active')) {
                    arrow.style.transform = "rotate(180deg)";
                } else {
                    arrow.style.transform = "rotate(0deg)";
                }
            }
        });
    }

    // --- 4. COOKIE BANNER (Fix Funzionamento) ---
    const cookieBanner = document.getElementById('cookie-banner');
    const acceptBtn = document.getElementById('accept-cookies');

    // Controllo se esiste già il salvataggio
    if (!localStorage.getItem('cookiesAccepted')) {
        // Aspetta 1 secondo e poi mostra il banner
        setTimeout(() => {
            cookieBanner.classList.add('show');
        }, 1000);
    }

    if (acceptBtn) {
        acceptBtn.addEventListener('click', () => {
            // 1. Rimuove la classe show (fa scendere il banner)
            cookieBanner.classList.remove('show');
            // 2. Salva la preferenza nel browser
            localStorage.setItem('cookiesAccepted', 'true');
        });
    }

    // --- 5. ANIMAZIONI SCROLL REVEAL ---
    const revealElements = document.querySelectorAll('.reveal');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
            }
        });
    }, { threshold: 0.1 });

    revealElements.forEach(el => observer.observe(el));
});