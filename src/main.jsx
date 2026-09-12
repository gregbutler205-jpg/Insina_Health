import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import CompanionApp from './components/companion/CompanionApp.jsx'
import { runMigrations } from './lib/migrations.js'
import { runTripwireEvaluation } from './lib/tripwire.js'
import { installInterception, isDemoMode } from './lib/secureStorage.js'
import './index.css'

// P-02: install the localStorage interception before anything else touches
// mi_* keys. Locked reads of managed keys fail safe (return null) from the
// very first line, rather than only once LockScreen's unlock() runs — no
// stray boot-time code can see raw ciphertext.
// Demo installs (fictional dataset, no vault) keep plaintext storage: with the
// interception active and no DEK, every mi_* read returns null and the demo
// renders an empty record. isDemoMode() is false whenever a real vault exists.
if (!isDemoMode()) installInterception()

// A-08: run schema migrations once, synchronously, before either entry point
// renders — both the full app and the companion read/write the same mi_*
// record, so this must happen above the isCompanion branch, not inside it.
// P-02/DEC-069: ONLY for demo installs, the one case whose record is
// readable here. Every other install has the interception installed and no
// DEK yet (a real vault, or a legacy plaintext install that has not created
// one), so every managed key reads null and every managed write is dropped:
// a data migration would silently no-op yet still stamp its version, and v3
// would delete mi_imaging outright. Those installs migrate in LockScreen's
// afterUnlock() (and the companion's Lock.finishUnlock()) instead, once the
// record is actually readable; runMigrations() itself also refuses to run
// while locked, so this guard is the explicit statement, not the only one.
if (isDemoMode()) runMigrations()

// A-01: importing tripwire.js registers its mi-data-synced listener (module
// load side effect) so it evaluates on every future lab write regardless of
// which tab is open. Also run once now so the envelope reflects the current
// record immediately at boot, not only after the next write.
runTripwireEvaluation()

// Companion renders for its own path (/companion/) or the legacy ?companion=1 query.
const isCompanion =
  /(^|\/)companion(\/|$)/.test(window.location.pathname) ||
  new URLSearchParams(window.location.search).has('companion')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isCompanion ? <CompanionApp /> : <App />}
  </StrictMode>,
)
