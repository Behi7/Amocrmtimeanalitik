import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
@Injectable()
export class ParseTagIdsPipe implements PipeTransform<string, number[]> {
  transform(value: string): number[] {
    if (!value) return [];
    const parts = value.split(',').map(s => s.trim()).filter(Boolean);
    const nums: number[] = [];
    for (const p of parts) {
      const n = parseInt(p, 10);
      if (isNaN(n)) throw new BadRequestException(`Invalid tagId: ${p}`);
      nums.push(n);
    }
    return nums;
  }
}
