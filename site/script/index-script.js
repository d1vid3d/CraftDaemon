// ── HAMBURGER MENU ──
    const hamburger = document.getElementById('hamburger');
    const mobileNav = document.getElementById('mobile-nav-overlay');
    
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('active');
      mobileNav.classList.toggle('active');
    });
    
    // Close mobile nav when link is clicked
    document.querySelectorAll('#mobile-nav-overlay a').forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        mobileNav.classList.remove('active');
      });
    });
    
    // Handle window resize
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) {
        hamburger.classList.remove('active');
        mobileNav.classList.remove('active');
      }
    });

    // ── SCROLL REVEAL ──
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }
      });
    }, { threshold: 0.08 });

    document.querySelectorAll('.reveal').forEach(el => obs.observe(el));

    // Stagger grid children
    document.querySelectorAll('.features-grid, .req-grid, .steps, .presence-grid, .showcase-grid').forEach(parent => {
      [...parent.querySelectorAll('.reveal')].forEach((el, i) => {
        el.style.transitionDelay = `${i * 0.07}s`;
      });
    });

    // ── GITHUB RELEASE FETCH ──
    async function fetchRelease() {
      const REPO = 'd1vid3d/CraftDaemon';
      try {
        const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
          headers: { Accept: 'application/vnd.github+json' }
        });
        if (!res.ok) throw new Error(`${res.status}`);
        const d = await res.json();

        const version = d.tag_name || 'Unknown';
        const url     = d.html_url || `https://github.com/${REPO}/releases`;
        const body    = d.body     || '_No changelog provided._';
        const date    = d.published_at
          ? new Date(d.published_at).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' })
          : '';

        // Hero badge
        const bt = document.getElementById('release-badge-text');
        bt.textContent = `Current Release: ${version}`;
        bt.classList.remove('loading-text');
        document.getElementById('release-badge').href = url;
        
        // Mobile badge
        const btMobile = document.querySelector('#release-badge-mobile .loading-text');
        if (btMobile) btMobile.textContent = `Current Release: ${version}`;

        // Card header
        document.getElementById('cl-version').textContent = version;
        document.getElementById('cl-date').textContent    = date;
        document.getElementById('cl-link').href           = url;

        // Changelog body
        document.getElementById('cl-body').innerHTML = renderMd(body);

      } catch(err) {
        const bt = document.getElementById('release-badge-text');
        bt.textContent = 'Current Release';
        bt.classList.remove('loading-text');
        document.getElementById('cl-version').textContent = '—';
        document.getElementById('cl-body').innerHTML =
          `<div class="release-error">⚠ Could not load changelog. &nbsp;<a href="https://github.com/${REPO}/releases" target="_blank" style="color:var(--blurple-bright)">View on GitHub ↗</a></div>`;
      }
    }

    // Lightweight markdown → HTML
    function renderMd(md) {
      const lines = md.split('\n');
      let html = '', inList = false, inCode = false;
      let codeLines = [];

      const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
      const escapeHtml = t => t
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const flushCodeBlock = () => {
        if (!inCode) return;
        const code = escapeHtml(codeLines.join('\n'));
        html += `<pre><code>${code}</code></pre>`;
        inCode = false;
        codeLines = [];
      };

      const inline = t => t
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

      for (const line of lines) {
        if (/^```/.test(line.trim())) {
          closeList();
          if (inCode) {
            flushCodeBlock();
          } else {
            inCode = true;
          }
          continue;
        }

        if (inCode) {
          codeLines.push(line);
          continue;
        }

        if      (/^###\s/.test(line)) { closeList(); html += `<h3>${inline(escapeHtml(line.slice(4)))}</h3>`; }
        else if (/^##\s/.test(line))  { closeList(); html += `<h2>${inline(escapeHtml(line.slice(3)))}</h2>`; }
        else if (/^#\s/.test(line))   { closeList(); html += `<h2>${inline(escapeHtml(line.slice(2)))}</h2>`; }
        else if (/^[-*+]\s/.test(line)) {
          if (!inList) { html += '<ul>'; inList = true; }
          html += `<li>${inline(escapeHtml(line.slice(2)))}</li>`;
        } else if (/^\s*((---+)|(\*\*\*+)|(___+))\s*$/.test(line)) {
          closeList();
          html += '<hr />';
        } else if (line.trim() === '') { closeList(); }
        else { closeList(); html += `<p>${inline(escapeHtml(line))}</p>`; }
      }
      flushCodeBlock();
      closeList();
      return `<div class="changelog-content">${html}</div>`;
    }

    // ── COLLAPSE/EXPAND RELEASE CARD ──
    document.getElementById('release-card-toggle').addEventListener('click', () => {
      const body = document.getElementById('release-card-body');
      const arrow = document.querySelector('.release-toggle-arrow');
      body.classList.toggle('collapsed');
      arrow.classList.toggle('collapsed');
    });

    // Collapse by default
    document.getElementById('release-card-body').classList.add('collapsed');
    document.querySelector('.release-toggle-arrow').classList.add('collapsed');

    // ── FETCH PREVIOUS RELEASES ──
    async function fetchPreviousReleases() {
      const REPO = 'd1vid3d/CraftDaemon';
      try {
        const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=6`, {
          headers: { Accept: 'application/vnd.github+json' }
        });
        if (!res.ok) throw new Error(`${res.status}`);
        const releases = await res.json();

        // Filter out the latest release, show up to 5 older ones
        const older = releases.slice(1, 6);

        if (older.length === 0) {
          document.getElementById('prev-releases-grid').innerHTML = 
            '<div style="grid-column:1/-1; text-align:center; color:var(--text-dimmer); font-family:var(--mono); font-size:0.75rem;">No previous releases</div>';
          return;
        }

        const grid = document.getElementById('prev-releases-grid');
        grid.innerHTML = '';

        older.forEach(release => {
          const version = release.tag_name || 'Unknown';
          const url = release.html_url || `https://github.com/${REPO}/releases`;
          const date = release.published_at
            ? new Date(release.published_at).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' })
            : '';

          const card = document.createElement('div');
          card.className = 'previous-release-card';
          card.innerHTML = `
            <div class="prev-version">${version}</div>
            <div class="prev-date">${date}</div>
            <a href="${url}" target="_blank" class="prev-link">View Release ↗</a>
          `;
          grid.appendChild(card);
        });
      } catch(err) {
        document.getElementById('prev-releases-grid').innerHTML = 
          `<div style="grid-column:1/-1; text-align:center; color:var(--text-dimmer); font-family:var(--mono); font-size:0.75rem;">Could not load previous releases</div>`;
      }
    }

    fetchRelease();
    fetchPreviousReleases();
