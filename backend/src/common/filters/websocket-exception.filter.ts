import { ArgumentsHost, Catch } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';

@Catch()
export class WebsocketExceptionFilter extends BaseWsExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost): void {
    const message = exception instanceof Error ? exception.message : 'Неизвестная ошибка';
    super.catch(new WsException({ ok: false, error: message }), host);
  }
}
