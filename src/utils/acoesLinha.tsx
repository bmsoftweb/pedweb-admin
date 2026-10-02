import React from 'react';
import { UserPlus, type LucideIcon } from 'lucide-react';
import { RegistroCrud } from '../types';
import { criarUsuarioDoVendedor } from '../services/api';

/**
 * Ações extras da coluna Ações, por tela. Cada uma pede confirmação antes de executar.
 * Com até 3 ícones eles ficam soltos; passando disso, viram menu "…".
 */
export interface AcaoLinha {
  id: string;
  titulo: string;
  icone: LucideIcon;
  /** Texto do diálogo de confirmação e, quando precisar, um campo a preencher */
  confirmacao: (row: RegistroCrud) => {
    titulo: string;
    texto: React.ReactNode;
    botao: string;
    campo?: { label: string; placeholder?: string; tipo?: string; inicial: string };
  };
  /** Executa a ação; o texto devolvido vira a notificação */
  executar: (row: RegistroCrud, valor: string) => Promise<string>;
}

export const ACOES_LINHA: Record<string, AcaoLinha[]> = {
  app_vendedores: [
    {
      id: 'criar-usuario',
      titulo: 'Criar usuário do aplicativo para este vendedor',
      icone: UserPlus,
      confirmacao: (row) => ({
        titulo: 'Criar usuário para este vendedor?',
        texto: (
          <>
            Será criado um usuário do aplicativo ligado a{' '}
            <strong className="text-stone-700 dark:text-stone-200">{String(row.nome || row.id_app)}</strong>, com a
            senha padrão <strong className="font-mono">1234</strong>. O login do aplicativo é o e-mail.
          </>
        ),
        botao: 'Criar usuário',
        campo: {
          label: 'E-mail de acesso',
          placeholder: 'ex: vendedor@empresa.com.br',
          tipo: 'email',
          inicial: String(row.email || ''),
        },
      }),
      executar: async (row, email) => {
        const r = await criarUsuarioDoVendedor(String(row.id_app), email);
        return `Usuário criado: login ${r.login}, senha ${r.senha}.`;
      },
    },
  ],
};
