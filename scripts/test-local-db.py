"""Prueba SQL contra un proyecto Supabase TEST efímero, sin credenciales remotas.

Necesita Docker, Node/npm y Python 3.11+. No ejecuta las pruebas HTTP de Edge
Functions. Cada ejecución crea su propio proyecto y lo elimina al terminar.
"""

import argparse
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import tomllib
import uuid

CLI_VERSION = '2.120.0'
ROOT = Path(__file__).resolve().parents[1]
SEEDS = (
    'seed_00_local_bootstrap.sql',
    'seed_2weeks_local.sql',
    'seed_role_users.sql',
    'seed_today_local.sql',
)
EXCLUDED = 'realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor'


def redact(output):
    output = re.sub(r'eyJ[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]+){1,2}', '[REDACTED JWT]', output)
    return re.sub(r'sb_(?:secret|publishable)_[A-Za-z0-9_-]+', '[REDACTED KEY]', output)


def run(args, label, *, quiet=False, check=True):
    result = subprocess.run(args, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            encoding='utf-8', errors='replace')
    print(f'{label}: exit {result.returncode}', flush=True)
    # El resumen de start contiene claves locales: no se registra si funciona.
    if not quiet or result.returncode:
        print(redact(result.stdout), flush=True)
    if check and result.returncode:
        raise RuntimeError(f'{label} failed')
    return result


def config_value(text, section, key, value):
    pattern = rf'(?ms)(^\[{re.escape(section)}\]\r?\n)(.*?)(?=^\[|\Z)'
    match = re.search(pattern, text)
    if not match:
        raise RuntimeError(f'Missing Supabase config section: {section}')
    body, count = re.subn(rf'(?m)^{re.escape(key)}\s*=.*$', f'{key} = {value}', match[2])
    if not count:
        body = body.rstrip() + f'\n{key} = {value}\n\n'
    return text[:match.start()] + match[1] + body + text[match.end():]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--supabase-bin', help='Optional installed Supabase CLI of the pinned version')
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding='utf-8')
    if args.supabase_bin:
        cli = [args.supabase_bin]
    else:
        npx = shutil.which('npx.cmd' if os.name == 'nt' else 'npx')
        if not npx:
            raise RuntimeError('Node/npm is required')
        cli = [npx, '--yes', f'supabase@{CLI_VERSION}']
    version = run(cli + ['--version'], 'Supabase CLI version')
    if not re.search(rf'(?m)^{re.escape(CLI_VERSION)}\s*$', version.stdout):
        raise RuntimeError(f'Supabase CLI {CLI_VERSION} is required')

    project = 'harvestpro-ci-' + uuid.uuid4().hex[:12]
    container = 'supabase_db_' + project
    with tempfile.TemporaryDirectory(prefix='harvestpro-db-ci-') as directory:
        workdir = Path(directory).resolve()
        assert workdir.parent == Path(tempfile.gettempdir()).resolve()
        assert workdir.name.startswith('harvestpro-db-ci-')
        supabase = workdir / 'supabase'
        supabase.mkdir()
        config = (ROOT / 'supabase/config.toml').read_text(encoding='utf-8')
        if re.search(r'(?m)^project_id\s*=', config):
            config = re.sub(r'(?m)^project_id\s*=.*$', f'project_id = "{project}"', config)
        else:
            config = f'project_id = "{project}"\n' + config
        # Puertos distintos de los del entorno local habitual (54321/54322).
        config = config_value(config, 'api', 'port', 61321)
        config = config_value(config, 'db', 'port', 61322)
        config = config_value(config, 'db', 'shadow_port', 61320)
        (supabase / 'config.toml').write_text(config, encoding='utf-8', newline='\n')
        assert tomllib.loads(config)['project_id'] == project
        shutil.copytree(ROOT / 'supabase/migrations', supabase / 'migrations')

        validation = workdir / 'validation'
        (validation / 'scripts').mkdir(parents=True)
        (validation / 'supabase/tests').mkdir(parents=True)
        (validation / 'seeds').mkdir()
        for seed in SEEDS:
            shutil.copyfile(ROOT / 'supabase/seeds' / seed, validation / 'seeds' / seed)
        shutil.copytree(ROOT / 'supabase/tests/security', validation / 'supabase/tests/security')
        (validation / 'scripts/test-db-security.sh').write_text(
            (ROOT / 'scripts/test-db-security.sh').read_text(encoding='utf-8'), encoding='utf-8', newline='\n')
        started = False
        try:
            # Proyecto UUID nuevo: no reutiliza ni resetea bases ya existentes.
            started = True
            run(cli + ['start', '--exclude', EXCLUDED, '--workdir', str(workdir)],
                'Start isolated TEST project', quiet=True)
            run(['docker', 'cp', str(validation) + '/.', container + ':/tmp/harvestpro-validation'],
                'Copy TEST fixtures')
            for seed in SEEDS:
                run(['docker', 'exec', container, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1',
                     '-U', 'postgres', '-d', 'postgres', '-f', '/tmp/harvestpro-validation/seeds/' + seed], seed)
            run(['docker', 'exec', '--user', 'postgres', '-e', 'DB_URL=postgresql:///postgres', container,
                 'bash', '/tmp/harvestpro-validation/scripts/test-db-security.sh'], 'SQL security')
        finally:
            if started:
                # Elimina únicamente el proyecto TEST recién creado y sus volúmenes.
                assert tomllib.loads((supabase / 'config.toml').read_text())['project_id'] == project
                run(cli + ['stop', '--no-backup', '--project-id', project, '--workdir', str(workdir)],
                    'Remove isolated TEST project', quiet=True)


if __name__ == '__main__':
    main()
