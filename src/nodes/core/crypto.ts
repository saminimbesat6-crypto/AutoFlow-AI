import * as crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { BaseNode } from '../base';
import { DataItem, NodeOutput, PortDefinition, PropertyDefinition } from '../../types/workflow';
import { NodeExecutionContext } from '../../engine/context';

export class CryptoNode extends BaseNode {
  type = 'crypto';
  name = 'Crypto & Hash';
  description = 'Performs cryptographic hashing, HMAC signatures, UUID generation, and Base64 encoding';
  category = 'transform' as const;
  icon = 'lock';
  color = '#10b981'; // emerald

  inputs: PortDefinition[] = [
    { name: 'main', type: 'main', label: 'Input' }
  ];
  outputs: PortDefinition[] = [
    { name: 'main', type: 'main', label: 'Output' }
  ];

  properties: PropertyDefinition[] = [
    {
      name: 'action',
      displayName: 'Action',
      type: 'options',
      default: 'hash',
      options: [
        { name: 'Hash (SHA256, MD5, SHA512)', value: 'hash' },
        { name: 'HMAC Signature', value: 'hmac' },
        { name: 'Generate UUID', value: 'uuid' },
        { name: 'Base64 Encode', value: 'base64Encode' },
        { name: 'Base64 Decode', value: 'base64Decode' }
      ]
    },
    {
      name: 'algorithm',
      displayName: 'Algorithm',
      type: 'options',
      default: 'sha256',
      options: [
        { name: 'SHA256', value: 'sha256' },
        { name: 'MD5', value: 'md5' },
        { name: 'SHA512', value: 'sha512' }
      ]
    },
    {
      name: 'value',
      displayName: 'Input Value',
      type: 'string',
      default: '{{ $json.data || "" }}',
      description: 'The string value to hash, sign, or encode'
    },
    {
      name: 'secretKey',
      displayName: 'Secret Key (for HMAC)',
      type: 'string',
      default: '',
      description: 'Secret key required for HMAC calculation'
    },
    {
      name: 'destinationField',
      displayName: 'Destination Field',
      type: 'string',
      default: 'cryptoResult',
      description: 'Field name to store the generated result in $json'
    }
  ];

  async execute(context: NodeExecutionContext): Promise<NodeOutput> {
    const items = context.inputData && context.inputData.length > 0
      ? context.inputData
      : [{ json: {} }];

    const results: DataItem[] = [];

    for (let i = 0; i < items.length; i++) {
      const action = context.getNodeParameter('action', i, 'hash');
      const algorithm = context.getNodeParameter('algorithm', i, 'sha256');
      const value = String(context.getNodeParameter('value', i, ''));
      const secret = String(context.getNodeParameter('secretKey', i, ''));
      const destField = String(context.getNodeParameter('destinationField', i, 'cryptoResult'));

      let result: string;
      switch (action) {
        case 'hash':
          result = crypto.createHash(algorithm).update(value).digest('hex');
          break;
        case 'hmac':
          result = crypto.createHmac(algorithm, secret).update(value).digest('hex');
          break;
        case 'uuid':
          result = uuidv4();
          break;
        case 'base64Encode':
          result = Buffer.from(value, 'utf8').toString('base64');
          break;
        case 'base64Decode':
          result = Buffer.from(value, 'base64').toString('utf8');
          break;
        default:
          result = value;
      }

      const itemCopy = JSON.parse(JSON.stringify(items[i]));
      itemCopy.json[destField] = result;
      results.push({ ...itemCopy, pairedItem: i });
    }

    return [results];
  }
}
