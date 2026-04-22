import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import mjml2html from 'mjml';
import * as Handlebars from 'handlebars';
import { convert as htmlToText } from 'html-to-text';

export type TemplateName =
  | 'verification'
  | 'password-reset'
  | 'password-changed';

export interface RenderedEmail {
  html: string;
  text: string;
}

@Injectable()
export class TemplateRenderer implements OnModuleInit {
  private readonly logger = new Logger(TemplateRenderer.name);
  private readonly templates = new Map<
    TemplateName,
    HandlebarsTemplateDelegate
  >();
  private readonly templatesDir = path.join(__dirname, 'templates');

  async onModuleInit(): Promise<void> {
    const names: TemplateName[] = [
      'verification',
      'password-reset',
      'password-changed',
    ];
    for (const name of names) {
      await this.compileTemplate(name);
    }
    this.logger.log(`Compiled ${this.templates.size} email templates`);
  }

  render<T extends Record<string, unknown>>(
    name: TemplateName,
    data: T,
  ): RenderedEmail {
    const template = this.templates.get(name);
    if (!template) {
      throw new Error(`Template não compilado: ${name}`);
    }

    const html = template(data);
    const text = htmlToText(html, {
      wordwrap: 80,
      selectors: [
        { selector: 'img', format: 'skip' },
        { selector: 'a', options: { hideLinkHrefIfSameAsText: true } },
      ],
    });

    return { html, text };
  }

  private async compileTemplate(name: TemplateName): Promise<void> {
    const filePath = path.join(this.templatesDir, `${name}.mjml`);
    const source = await fs.readFile(filePath, 'utf-8');

    const result = await mjml2html(source, {
      filePath,
      validationLevel: 'strict',
    });

    if (result.errors && result.errors.length > 0) {
      const details = result.errors
        .map((err) => `${err.line ?? '?'}: ${err.message}`)
        .join('; ');
      throw new Error(`MJML erro em ${name}.mjml: ${details}`);
    }

    const compiled = Handlebars.compile(result.html, { noEscape: false });
    this.templates.set(name, compiled);
  }
}
