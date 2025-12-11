document.addEventListener('DOMContentLoaded', () => {

   

    /* --- 1. GESTIONE MENU MOBILE E DROPDOWN --- */

    const burger = document.querySelector('.burger');

    const nav = document.querySelector('.nav-links');

    const dropdownLink = document.querySelector('.dropdown > a');

    const dropdownLi = document.querySelector('.dropdown');



    // Apertura Menu Principale

    if (burger) {

        burger.addEventListener('click', () => {

            nav.classList.toggle('nav-active');

           

            // Icona X o Burger

            if (nav.classList.contains('nav-active')) {

                burger.innerHTML = '<i class="fas fa-times"></i>';

                burger.style.color = "#d4af37";

            } else {

                burger.innerHTML = '<i class="fas fa-bars"></i>';

                burger.style.color = "#fff";

            }

        });

    }



    // Apertura Sottomenu (Collezioni)

    if (dropdownLink) {

        dropdownLink.addEventListener('click', (e) => {

            // Solo su mobile

            if (window.innerWidth <= 968) {

                e.preventDefault(); // Non ricaricare la pagina

                dropdownLi.classList.toggle('mobile-active');

               

                // Ruota freccia

                const arrow = dropdownLink.querySelector('i');

                if (arrow) {

                    arrow.style.transform = dropdownLi.classList.contains('mobile-active')

                        ? "rotate(180deg)"

                        : "rotate(0deg)";

                }

            }

        });

    }



    /* --- 2. GESTIONE COOKIE BANNER (Forzata) --- */

    const cookieBanner = document.getElementById('cookie-banner');

    const acceptBtn = document.getElementById('accept-cookies');



    // Se il cookie non è salvato, mostra il banner dopo 1 secondo

    if (!localStorage.getItem('cookiesAccepted')) {

        if(cookieBanner) {

            setTimeout(() => {

                cookieBanner.style.display = 'flex'; // Forza display

                // Piccola attesa per l'animazione CSS se presente, altrimenti appare e basta

                setTimeout(() => cookieBanner.classList.add('show'), 10);

            }, 1000);

        }

    } else {

        // Se già accettato, nascondi sicuro

        if(cookieBanner) cookieBanner.style.display = 'none';

    }



    // Al click su Accetta

    if (acceptBtn) {

        acceptBtn.addEventListener('click', function(e) {

            e.preventDefault();

            // Nascondi immediatamente

            if(cookieBanner) {

                cookieBanner.style.display = 'none';

                cookieBanner.classList.remove('show');

            }

            // Salva preferenza

            localStorage.setItem('cookiesAccepted', 'true');

        });

    }



    /* --- 3. NAVBAR SCROLL --- */

    const navbar = document.querySelector('.navbar');

    window.addEventListener('scroll', () => {

        if (window.scrollY > 30) {

            navbar.classList.add('scrolled');

        } else {

            navbar.classList.remove('scrolled');

        }

    });



    /* --- 4. SCROLL REVEAL --- */

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