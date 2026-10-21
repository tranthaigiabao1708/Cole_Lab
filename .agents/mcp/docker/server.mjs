#!/usr/bin/env node
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import fs from 'node:fs';

const DOCKER_BIN = fs.existsSync('C:\\Users\\giaba\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe')
  ? 'C:\\Users\\giaba\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe'
  : 'docker';

function runDocker(args, cwd = process.cwd(), timeoutMs = 60000) {
  return new Promise((resolve) => {
    const proc = spawn(DOCKER_BIN, args, {
      cwd,
      windowsHide: true,
      env: {
        ...process.env,
        PATH: `C:\\Users\\giaba\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin;${process.env.PATH || ''}`
      }
    });

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      resolve({ exitCode: -1, stdout, stderr: stderr + '\n[Error: Docker command timed out]' });
    }, timeoutMs);

    proc.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
    proc.stderr.on('data', (d) => { stderr += d.toString('utf8'); });

    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? 0, stdout, stderr });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({ exitCode: -1, stdout, stderr: err.message });
    });
  });
}

const TOOLS = [
  {
    name: 'docker_info',
    description: 'Get Docker system info, version, container and image counts, and health status.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'docker_ps',
    description: 'List Docker containers. By default shows running containers; set all=true to see stopped containers as well.',
    inputSchema: {
      type: 'object',
      properties: {
        all: {
          type: 'boolean',
          description: 'If true, show all containers (running and stopped)'
        },
        format: {
          type: 'string',
          enum: ['table', 'json'],
          description: 'Output format (default: json)'
        }
      }
    }
  },
  {
    name: 'docker_images',
    description: 'List local Docker images stored on the host.',
    inputSchema: {
      type: 'object',
      properties: {
        all: {
          type: 'boolean',
          description: 'Show all images including intermediate layers'
        }
      }
    }
  },
  {
    name: 'docker_run',
    description: 'Run a new Docker container with specified parameters.',
    inputSchema: {
      type: 'object',
      properties: {
        image: { type: 'string', description: 'Docker image to run (e.g. redis:alpine, python:3.12-slim)' },
        name: { type: 'string', description: 'Optional name for the container' },
        ports: { type: 'array', items: { type: 'string' }, description: 'Port mappings (e.g. ["8000:8000", "5432:5432"])' },
        env: { type: 'array', items: { type: 'string' }, description: 'Environment variables (e.g. ["POSTGRES_PASSWORD=secret"])' },
        volumes: { type: 'array', items: { type: 'string' }, description: 'Volume binds (e.g. ["mydata:/data"])' },
        detach: { type: 'boolean', description: 'Run container in background (default true)' },
        command: { type: 'array', items: { type: 'string' }, description: 'Optional command override' }
      },
      required: ['image']
    }
  },
  {
    name: 'docker_stop',
    description: 'Stop one or more running Docker containers.',
    inputSchema: {
      type: 'object',
      properties: {
        container: { type: 'string', description: 'Container ID or Name to stop' },
        timeout: { type: 'number', description: 'Seconds to wait before killing (default 10)' }
      },
      required: ['container']
    }
  },
  {
    name: 'docker_start',
    description: 'Start one or more stopped Docker containers.',
    inputSchema: {
      type: 'object',
      properties: {
        container: { type: 'string', description: 'Container ID or Name to start' }
      },
      required: ['container']
    }
  },
  {
    name: 'docker_restart',
    description: 'Restart a Docker container.',
    inputSchema: {
      type: 'object',
      properties: {
        container: { type: 'string', description: 'Container ID or Name to restart' }
      },
      required: ['container']
    }
  },
  {
    name: 'docker_rm',
    description: 'Remove a container.',
    inputSchema: {
      type: 'object',
      properties: {
        container: { type: 'string', description: 'Container ID or Name to remove' },
        force: { type: 'boolean', description: 'Force removal of a running container' },
        volumes: { type: 'boolean', description: 'Remove anonymous volumes associated with container' }
      },
      required: ['container']
    }
  },
  {
    name: 'docker_logs',
    description: 'Fetch the logs of a container.',
    inputSchema: {
      type: 'object',
      properties: {
        container: { type: 'string', description: 'Container ID or Name' },
        tail: { type: 'number', description: 'Number of lines to show from the end of the logs (default 100)' },
        timestamps: { type: 'boolean', description: 'Show timestamps' }
      },
      required: ['container']
    }
  },
  {
    name: 'docker_exec',
    description: 'Execute a command inside an active running Docker container.',
    inputSchema: {
      type: 'object',
      properties: {
        container: { type: 'string', description: 'Target container ID or Name' },
        command: { type: 'array', items: { type: 'string' }, description: 'Command and arguments to execute, e.g. ["ls", "-la"] or ["python", "-c", "print(1)"]' },
        workdir: { type: 'string', description: 'Working directory inside the container' }
      },
      required: ['container', 'command']
    }
  },
  {
    name: 'docker_compose',
    description: 'Run docker compose commands (up, down, ps, restart, logs, build) in a given directory.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['up', 'down', 'ps', 'restart', 'logs', 'build', 'pull'],
          description: 'Compose action to perform'
        },
        cwd: { type: 'string', description: 'Directory containing docker-compose.yml (default: current workspace)' },
        args: { type: 'array', items: { type: 'string' }, description: 'Additional arguments (e.g. ["-d", "--build"])' }
      },
      required: ['action']
    }
  },
  {
    name: 'docker_inspect',
    description: 'Return detailed low-level JSON information on Docker objects (containers, images, volumes, networks).',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Container, image, network, or volume name/ID' }
      },
      required: ['target']
    }
  }
];

async function handleToolCall(name, args) {
  switch (name) {
    case 'docker_info': {
      const res = await runDocker(['info', '--format', 'json']);
      if (res.exitCode !== 0) {
        const fallback = await runDocker(['version']);
        return fallback.stdout || fallback.stderr;
      }
      try {
        const info = JSON.parse(res.stdout);
        const summary = {
          ServerVersion: info.ServerVersion,
          Containers: info.Containers,
          ContainersRunning: info.ContainersRunning,
          ContainersPaused: info.ContainersPaused,
          ContainersStopped: info.ContainersStopped,
          Images: info.Images,
          Driver: info.Driver,
          OperatingSystem: info.OperatingSystem,
          OSType: info.OSType,
          Architecture: info.Architecture,
          NCPU: info.NCPU,
          MemTotalBytes: info.MemTotal
        };
        return JSON.stringify(summary, null, 2);
      } catch {
        return res.stdout;
      }
    }

    case 'docker_ps': {
      const showAll = args.all !== false;
      const fmt = args.format === 'table' ? [] : ['--format', '{{json .}}'];
      const cmdArgs = ['ps'];
      if (showAll) cmdArgs.push('-a');
      cmdArgs.push(...fmt);

      const res = await runDocker(cmdArgs);
      if (res.exitCode !== 0) return `Error listing containers: ${res.stderr}`;
      if (!res.stdout.trim()) return 'No containers found.';

      if (args.format === 'table') return res.stdout;

      try {
        const lines = res.stdout.trim().split('\n').filter(Boolean);
        const parsed = lines.map((l) => JSON.parse(l));
        return JSON.stringify(parsed, null, 2);
      } catch {
        return res.stdout;
      }
    }

    case 'docker_images': {
      const cmdArgs = ['images', '--format', '{{json .}}'];
      if (args.all) cmdArgs.push('-a');

      const res = await runDocker(cmdArgs);
      if (res.exitCode !== 0) return `Error listing images: ${res.stderr}`;
      if (!res.stdout.trim()) return 'No local images found.';

      try {
        const lines = res.stdout.trim().split('\n').filter(Boolean);
        const parsed = lines.map((l) => JSON.parse(l));
        return JSON.stringify(parsed, null, 2);
      } catch {
        return res.stdout;
      }
    }

    case 'docker_run': {
      const cmdArgs = ['run'];
      if (args.detach !== false) cmdArgs.push('-d');
      if (args.name) cmdArgs.push('--name', args.name);
      if (Array.isArray(args.ports)) {
        for (const p of args.ports) cmdArgs.push('-p', p);
      }
      if (Array.isArray(args.env)) {
        for (const e of args.env) cmdArgs.push('-e', e);
      }
      if (Array.isArray(args.volumes)) {
        for (const v of args.volumes) cmdArgs.push('-v', v);
      }
      cmdArgs.push(args.image);
      if (Array.isArray(args.command)) {
        cmdArgs.push(...args.command);
      }

      const res = await runDocker(cmdArgs, process.cwd(), 120000);
      if (res.exitCode !== 0) return `Failed to run container: ${res.stderr}\n${res.stdout}`;
      return `Container started successfully. ID: ${res.stdout.trim()}`;
    }

    case 'docker_stop': {
      const timeout = args.timeout ?? 10;
      const res = await runDocker(['stop', '-t', String(timeout), args.container]);
      if (res.exitCode !== 0) return `Failed to stop container: ${res.stderr}`;
      return `Container stopped: ${res.stdout.trim()}`;
    }

    case 'docker_start': {
      const res = await runDocker(['start', args.container]);
      if (res.exitCode !== 0) return `Failed to start container: ${res.stderr}`;
      return `Container started: ${res.stdout.trim()}`;
    }

    case 'docker_restart': {
      const res = await runDocker(['restart', args.container]);
      if (res.exitCode !== 0) return `Failed to restart container: ${res.stderr}`;
      return `Container restarted: ${res.stdout.trim()}`;
    }

    case 'docker_rm': {
      const cmdArgs = ['rm'];
      if (args.force) cmdArgs.push('-f');
      if (args.volumes) cmdArgs.push('-v');
      cmdArgs.push(args.container);

      const res = await runDocker(cmdArgs);
      if (res.exitCode !== 0) return `Failed to remove container: ${res.stderr}`;
      return `Container removed: ${res.stdout.trim()}`;
    }

    case 'docker_logs': {
      const tail = args.tail ?? 100;
      const cmdArgs = ['logs', '--tail', String(tail)];
      if (args.timestamps) cmdArgs.push('-t');
      cmdArgs.push(args.container);

      const res = await runDocker(cmdArgs);
      return res.stdout || res.stderr || '(No logs recorded)';
    }

    case 'docker_exec': {
      const cmdArgs = ['exec'];
      if (args.workdir) cmdArgs.push('-w', args.workdir);
      cmdArgs.push(args.container);
      cmdArgs.push(...args.command);

      const res = await runDocker(cmdArgs, process.cwd(), 60000);
      if (res.exitCode !== 0) {
        return `Exec exited with code ${res.exitCode}\nSTDOUT:\n${res.stdout}\nSTDERR:\n${res.stderr}`;
      }
      return res.stdout || res.stderr || '(Command finished with no output)';
    }

    case 'docker_compose': {
      const cwd = args.cwd || process.cwd();
      const cmdArgs = ['compose', args.action];
      if (Array.isArray(args.args)) {
        cmdArgs.push(...args.args);
      } else if (args.action === 'up') {
        cmdArgs.push('-d');
      }

      const res = await runDocker(cmdArgs, cwd, 180000);
      if (res.exitCode !== 0) {
        return `Docker compose ${args.action} failed:\n${res.stderr}\n${res.stdout}`;
      }
      return res.stdout || res.stderr || `Docker compose ${args.action} completed successfully.`;
    }

    case 'docker_inspect': {
      const res = await runDocker(['inspect', args.target]);
      if (res.exitCode !== 0) return `Failed to inspect ${args.target}: ${res.stderr}`;
      return res.stdout;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// JSON-RPC stdio protocol loop
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

function sendResponse(id, result, error = null) {
  const resp = { jsonrpc: '2.0', id };
  if (error) {
    resp.error = error;
  } else {
    resp.result = result;
  }
  process.stdout.write(JSON.stringify(resp) + '\n');
}

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const msg = JSON.parse(trimmed);

    // Notifications (no id)
    if (msg.id === undefined || msg.id === null) {
      return;
    }

    const { id, method, params } = msg;

    if (method === 'initialize') {
      sendResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {
            listChanged: false
          }
        },
        serverInfo: {
          name: 'docker-control',
          version: '1.0.0'
        }
      });
      return;
    }

    if (method === 'ping') {
      sendResponse(id, {});
      return;
    }

    if (method === 'tools/list') {
      sendResponse(id, { tools: TOOLS });
      return;
    }

    if (method === 'tools/call') {
      const { name, arguments: toolArgs = {} } = params || {};
      try {
        const textResult = await handleToolCall(name, toolArgs);
        sendResponse(id, {
          content: [
            {
              type: 'text',
              text: String(textResult)
            }
          ]
        });
      } catch (err) {
        sendResponse(id, {
          content: [
            {
              type: 'text',
              text: `Tool error: ${err.message}`
            }
          ],
          isError: true
        });
      }
      return;
    }

    sendResponse(id, null, {
      code: -32601,
      message: `Method not found: ${method}`
    });
  } catch (err) {
    // Malformed JSON
  }
});
