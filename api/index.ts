import { createApp } from '../server/app';

// A Vercel aceita um app Express como handler: ele já é uma função (req, res).
// O vercel.json manda todo /api/* para cá, preservando o caminho original.
export default createApp();
