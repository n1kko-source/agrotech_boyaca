import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './shared/configure-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  configureApp(app);
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
