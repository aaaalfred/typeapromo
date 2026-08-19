import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Desmonta lo renderizado entre tests: sin esto, dos tests que rendericen el
// mismo componente se pisan y `getByRole` encuentra dos coincidencias.
afterEach(() => {
  cleanup()
})
