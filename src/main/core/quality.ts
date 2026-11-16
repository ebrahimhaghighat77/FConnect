import net from 'node:net'
import type { Quality } from '../../shared/types'

// One CONNECT tunnel kept open through the proxy, so after the first request each probe costs a single round trip, like game packets.
export class QualityProbe {
  private sock?: net.Socket
  private buf = ''
  private waiter?: (ok: boolean) => void
  private readonly history: (number | null)[] = []

  constructor(private readonly proxyPort: number) {}

  private open(): Promise<boolean> {
    return new Promise((resolve) => {
      const sock = net.connect(this.proxyPort, '127.0.0.1')
      const fail = () => {
        sock.destroy()
        resolve(false)
      }
      sock.setTimeout(5000, fail)
      sock.once('error', fail)
      sock.once('connect', () => sock.write('CONNECT www.gstatic.com:80 HTTP/1.1\r\nHost: www.gstatic.com:80\r\n\r\n'))
      let head = ''
      const onHead = (chunk: Buffer) => {
        head += chunk.toString('latin1')
        if (!head.includes('\r\n\r\n')) return
        sock.off('data', onHead)
        if (!/^HTTP\/1\.[01] 200/.test(head)) return fail()
        sock.setTimeout(0)
        sock.removeAllListeners('error')
        sock.on('error', () => this.drop())
        sock.on('close', () => this.drop())
        sock.on('data', (c: Buffer) => this.onData(c))
        this.sock = sock
        resolve(true)
      }
      sock.on('data', onHead)
    })
  }

  private onData(chunk: Buffer): void {
    this.buf += chunk.toString('latin1')
    const end = this.buf.indexOf('\r\n\r\n')
    if (end < 0) return
    const ok = /^HTTP\/1\.[01] 20[04]/.test(this.buf)
    this.buf = this.buf.slice(end + 4)
    this.waiter?.(ok)
  }

  private drop(): void {
    this.sock?.destroy()
    this.sock = undefined
    this.buf = ''
    this.waiter?.(false)
  }

  private request(timeoutMs: number): Promise<number | null> {
    const start = performance.now()
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiter = undefined
        this.drop()
        resolve(null)
      }, timeoutMs)
      this.waiter = (ok) => {
        clearTimeout(timer)
        this.waiter = undefined
        if (!ok) this.drop()
        resolve(ok ? Math.round(performance.now() - start) : null)
      }
      this.sock!.write('GET /generate_204 HTTP/1.1\r\nHost: www.gstatic.com\r\nConnection: keep-alive\r\n\r\n')
    })
  }

  async sample(timeoutMs = 2500): Promise<number | null> {
    let ms: number | null = null
    const fresh = !this.sock
    if (this.sock || (await this.open())) {
      // The first request on a new tunnel pays for the server-side connect, so it is not a fair ping.
      if (fresh && (await this.request(timeoutMs)) === null) ms = null
      else ms = this.sock ? await this.request(timeoutMs) : null
    }
    this.history.push(ms)
    if (this.history.length > 40) this.history.shift()
    return ms
  }

  quality(): Quality {
    const recent = this.history.slice(-20)
    const good = recent.filter((v): v is number => v !== null)
    const diffs = good.slice(1).map((v, i) => Math.abs(v - good[i]))
    return {
      ping: good.length ? good[good.length - 1] : null,
      jitter: diffs.length ? Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length) : null,
      loss: recent.length ? Math.round(((recent.length - good.length) / recent.length) * 100) : 0,
      history: [...this.history]
    }
  }

  failuresInRow(): number {
    let n = 0
    for (let i = this.history.length - 1; i >= 0 && this.history[i] === null; i--) n++
    return n
  }

  close(): void {
    this.waiter = undefined
    this.drop()
  }
}
