// Delivery Dash: one money format everywhere (order chips, popups, goal, garage, results):
// Turkish shows lira (₺12.345), English dollars ($12,345).
import { getLang } from '@core';

/** Numbers with thousands separators (TR: 12.345, EN: 12,345). */
export const fmt = (n: number): string => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, getLang() === 'tr' ? '.' : ',');
export const money = (n: number): string => (getLang() === 'tr' ? '₺' : '$') + fmt(n);
