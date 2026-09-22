/**
 * Test E2E de la landing pública con catálogo de planes y página próximamente.
 *
 * Verifica:
 * - GET / sin sesión responde 200 y no redirige a /app.
 * - Muestra las tarjetas Gratis, Pro, Business y Equipo.
 * - Pro y Equipo muestran el distintivo "Próximamente".
 * - Clic en el CTA de Pro navega a /proximamente?plan=pro.
 * - Clic en el CTA de Business navega a /crear-cuenta?plan=business con indicador del plan.
 * - Si hay sesión previa, el header muestra "Ir al panel" que navega a /app.
 */

import { expect, test } from './utiles/fixtures';

test.describe('Landing pública y planes', () => {
  test('GET / sin sesión devuelve la landing page 200 sin redirigir a /app', async ({
    page,
  }) => {
    const respuesta = await page.goto('/');
    expect(respuesta?.status()).toBe(200);
    expect(page.url()).not.toContain('/app');

    // Comprobar título principal
    await expect(page.getByRole('heading', { level: 1, name: 'Typeapromo' })).toBeVisible();

    // Comprobar catálogo de planes
    await expect(page.getByRole('heading', { level: 3, name: 'Gratis' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Pro' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Business' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Equipo' })).toBeVisible();

    // Las tarjetas Pro y Equipo muestran el distintivo 'Próximamente'
    const proximamenteBadges = page.getByText('Próximamente', { exact: true });
    await expect(proximamenteBadges).toHaveCount(2);

    // Enlaces de navegación del header y footer
    await expect(page.getByRole('link', { name: 'Iniciar sesión' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Crear cuenta' }).first()).toBeVisible();
  });

  test('clic en el CTA de Pro navega a /proximamente?plan=pro', async ({ page }) => {
    await page.goto('/');

    const enlacePro = page.getByRole('link', { name: 'Más información sobre Pro' });
    await expect(enlacePro).toBeVisible();
    await enlacePro.click();

    await expect(page).toHaveURL(/\/proximamente\?plan=pro/);
    await expect(page.getByRole('heading', { level: 1, name: /Plan Pro/i })).toBeVisible();
    await expect(page.getByText('Próximamente disponible')).toBeVisible();
  });

  test('clic en el CTA de Business navega a /crear-cuenta?plan=business', async ({ page }) => {
    await page.goto('/');

    const enlaceBusiness = page.getByRole('link', { name: 'Comenzar con Business' });
    await expect(enlaceBusiness).toBeVisible();
    await enlaceBusiness.click();

    await expect(page).toHaveURL(/\/crear-cuenta\?plan=business/);
    await expect(page.getByText('Plan seleccionado: Business')).toBeVisible();
  });

  test('con sesión activa, el header de la landing muestra "Ir al panel" y enlaza a /app', async ({
    paginaAdmin,
  }) => {
    await paginaAdmin.goto('/');
    await expect(paginaAdmin.getByRole('heading', { level: 1, name: 'Typeapromo' })).toBeVisible();

    const botonPanel = paginaAdmin.getByRole('link', { name: 'Ir al panel' }).first();
    await expect(botonPanel).toBeVisible();
    await botonPanel.click();

    await expect(paginaAdmin).toHaveURL(/\/app/);
  });
});
