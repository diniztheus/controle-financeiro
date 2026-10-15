/** Apaga a pasta de dados temporária dos testes e2e, para cada rodada começar do zero. */
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const pasta = process.env.DADOS_DIR;
if (!pasta || !pasta.startsWith(tmpdir())) {
  console.error(`Recusando apagar ${pasta ?? '(vazio)'}: só pastas temporárias.`);
  process.exit(1);
}
rmSync(pasta, { recursive: true, force: true });
