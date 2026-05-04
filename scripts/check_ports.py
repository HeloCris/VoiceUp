import socket
from pathlib import Path
path = Path('scripts/port-check.txt')
with path.open('w', encoding='utf8') as f:
    for port in [8080, 5173, 8081]:
        with socket.socket() as s:
            try:
                s.connect(('127.0.0.1', port))
                f.write(f'{port}: open\n')
            except Exception as e:
                f.write(f'{port}: closed ({e})\n')
